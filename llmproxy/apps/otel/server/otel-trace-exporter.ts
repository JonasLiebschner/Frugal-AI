import { ExportResultCode, getStringFromEnv, parseKeyPairsIntoRecord } from "@opentelemetry/core";
import { ProtobufTraceSerializer } from "@opentelemetry/otlp-transformer";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

import type {
  JsonValue,
  RequestOtelDebug,
  RequestOtelExportResult,
} from "../../shared/type-api";
import type { OtelConfig } from "./otel-types";

export interface OtelTraceDebugContext {
  requestId: string;
  span: JsonValue;
  onUpdate?: (debug: RequestOtelDebug) => void;
}

export class OtelRequestDebugTracker {
  private readonly entries = new Map<string, {
    state: RequestOtelDebug;
    onUpdate?: (debug: RequestOtelDebug) => void;
  }>();

  public register(context: OtelTraceDebugContext): void {
    const state: RequestOtelDebug = {
      pending: true,
      span: cloneJsonValue(context.span),
    };

    this.entries.set(context.requestId, {
      state,
      onUpdate: context.onUpdate,
    });
    this.notify(context.requestId);
  }

  public markExportStarted(
    spans: ReadableSpan[],
  ): void {
    for (const span of spans) {
      const requestId = resolveRequestId(span);
      if (!requestId) {
        continue;
      }

      const entry = this.entries.get(requestId);
      if (!entry) {
        continue;
      }

      entry.state = {
        ...entry.state,
        pending: true,
        span: buildReadableSpanDebugSpan(span),
      };
      this.notify(requestId);
    }
  }

  public markExportFinished(
    spans: ReadableSpan[],
    result: RequestOtelExportResult,
  ): void {
    for (const requestId of this.listRequestIds(spans)) {
      const entry = this.entries.get(requestId);
      if (!entry) {
        continue;
      }

      entry.state = {
        ...entry.state,
        pending: false,
        result: cloneRequestOtelExportResult(result),
      };
      this.notify(requestId);
      this.entries.delete(requestId);
    }
  }

  private listRequestIds(spans: ReadableSpan[]): string[] {
    return Array.from(new Set(
      spans
        .map((span) => resolveRequestId(span))
        .filter((requestId): requestId is string => Boolean(requestId)),
    ));
  }

  private notify(requestId: string): void {
    const entry = this.entries.get(requestId);
    if (!entry?.onUpdate) {
      return;
    }

    entry.onUpdate(cloneRequestOtelDebug(entry.state));
  }
}

export class RequestDebugDelegatingSpanExporter implements SpanExporter {
  public constructor(
    private readonly delegate: SpanExporter,
    private readonly tracker: OtelRequestDebugTracker,
  ) {}

  public export(
    spans: ReadableSpan[],
    resultCallback: Parameters<SpanExporter["export"]>[1],
  ): void {
    this.tracker.markExportStarted(spans);

    try {
      this.delegate.export(spans, (result) => {
        this.tracker.markExportFinished(spans, {
          outcome: result.code === ExportResultCode.SUCCESS ? "success" : "failed",
          exportedAt: new Date().toISOString(),
          ...(result.error
            ? {
              error: result.error instanceof Error
                ? result.error.message
                : String(result.error),
            }
            : {}),
        });
        resultCallback(result);
      });
    } catch (error) {
      this.tracker.markExportFinished(spans, {
        outcome: "failed",
        exportedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  public async shutdown(): Promise<void> {
    await this.delegate.shutdown();
  }

  public async forceFlush(): Promise<void> {
    if (typeof this.delegate.forceFlush === "function") {
      await this.delegate.forceFlush();
    }
  }
}

export class RequestDebugOtlpHttpTraceExporter implements SpanExporter {
  public constructor(
    private readonly config: OtelConfig,
    private readonly tracker: OtelRequestDebugTracker,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  public export(
    spans: ReadableSpan[],
    resultCallback: Parameters<SpanExporter["export"]>[1],
  ): void {
    void this.exportAsync(spans, resultCallback);
  }

  public async shutdown(): Promise<void> {
    return Promise.resolve();
  }

  public async forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  private async exportAsync(
    spans: ReadableSpan[],
    resultCallback: Parameters<SpanExporter["export"]>[1],
  ): Promise<void> {
    const endpoint = resolveOtlpTracesEndpoint(this.config);
    const headers = resolveOtlpTracesHeaders(this.config);
    const payload = ProtobufTraceSerializer.serializeRequest(spans) ?? new Uint8Array();
    this.tracker.markExportStarted(spans);

    const timeoutMs = this.config.timeoutMs;
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => {
      timeoutController.abort(new Error(`OTLP trace export timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers,
        body: Buffer.from(payload),
        signal: timeoutController.signal,
      });
      const responseBody = await readResponseBody(response);
      const result: RequestOtelExportResult = {
        outcome: response.ok ? "success" : "failed",
        exportedAt: new Date().toISOString(),
        statusCode: response.status,
        ...(!response.ok ? { error: `OTLP trace export failed with status ${response.status}.` } : {}),
        ...(responseBody !== undefined ? { responseBody } : {}),
      };

      this.tracker.markExportFinished(spans, result);
      resultCallback({
        code: response.ok ? ExportResultCode.SUCCESS : ExportResultCode.FAILED,
        ...(response.ok
          ? {}
          : { error: new Error(`OTLP trace export failed with status ${response.status}.`) }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.tracker.markExportFinished(spans, {
        outcome: "failed",
        exportedAt: new Date().toISOString(),
        error: message,
      });
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(message),
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function resolveRequestId(span: ReadableSpan): string | undefined {
  const attributeRequestId = span.attributes["llmproxy.request.id"];
  return typeof attributeRequestId === "string" && attributeRequestId.length > 0
    ? attributeRequestId
    : undefined;
}

function buildReadableSpanDebugSpan(
  span: ReadableSpan,
): JsonValue {
  const context = span.spanContext();

  return compactJsonObject({
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: span.parentSpanContext?.spanId,
    name: span.name,
    kind: resolveSpanKindText(span.kind),
    startTime: serializeHrTime(span.startTime),
    endTime: serializeHrTime(span.endTime),
    status: compactJsonObject({
      code: resolveStatusCodeText(span.status.code),
      ...(span.status.message ? { message: span.status.message } : {}),
    }),
    attributes: attributesToJsonValue(span.attributes),
    events: span.events.length > 0
      ? span.events.map((event) => compactJsonObject({
        name: event.name,
        time: serializeHrTime(event.time),
        attributes: event.attributes ? attributesToJsonValue(event.attributes) : undefined,
      }))
      : [],
    instrumentationScope: compactJsonObject({
      name: span.instrumentationScope.name,
      ...(span.instrumentationScope.version ? { version: span.instrumentationScope.version } : {}),
      ...(span.instrumentationScope.schemaUrl ? { schemaUrl: span.instrumentationScope.schemaUrl } : {}),
    }),
    resource: attributesToJsonValue(span.resource.attributes),
  });
}

function resolveOtlpTracesEndpoint(config: OtelConfig): string {
  if (config.endpoint) {
    return config.endpoint;
  }

  const signalSpecificUrl = normalizeSpecificEndpoint(getStringFromEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"));
  if (signalSpecificUrl) {
    return signalSpecificUrl;
  }

  const genericUrl = appendSignalPath(
    getStringFromEnv("OTEL_EXPORTER_OTLP_ENDPOINT"),
    "v1/traces",
  );
  return genericUrl ?? "http://localhost:4318/v1/traces";
}

function resolveOtlpTracesHeaders(config: OtelConfig): Record<string, string> {
  return {
    ...parseKeyPairsIntoRecord(getStringFromEnv("OTEL_EXPORTER_OTLP_HEADERS")),
    ...parseKeyPairsIntoRecord(getStringFromEnv("OTEL_EXPORTER_OTLP_TRACES_HEADERS")),
    ...(config.headers ?? {}),
    "Content-Type": "application/x-protobuf",
    Accept: "application/x-protobuf, application/json",
  };
}

function normalizeSpecificEndpoint(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}

function appendSignalPath(
  value: string | undefined,
  signalPath: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const base = new URL(value);
    const pathname = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
    base.pathname = `${pathname}${signalPath}`;
    return base.toString();
  } catch {
    return undefined;
  }
}

async function readResponseBody(response: Response): Promise<JsonValue | undefined> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) {
    return undefined;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/x-protobuf")) {
    return toJsonValue(ProtobufTraceSerializer.deserializeResponse(bytes));
  }

  const text = new TextDecoder().decode(bytes);
  return parseTextResponseBody(text);
}

function parseTextResponseBody(value: string): JsonValue {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    return trimmed;
  }
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const converted = value
      .map((entry) => toJsonValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);

    return converted.length === value.length ? converted : undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, JsonValue>>((result, [key, entry]) => {
    const converted = toJsonValue(entry);
    if (converted !== undefined) {
      result[key] = converted;
    }
    return result;
  }, {});
}

function serializeHrTime(value: [number, number] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const [seconds, nanos] = value;
  return new Date((seconds * 1_000) + (nanos / 1_000_000)).toISOString();
}

function resolveSpanKindText(kind: ReadableSpan["kind"]): string {
  switch (kind) {
    case 0:
      return "INTERNAL";
    case 1:
      return "SERVER";
    case 2:
      return "CLIENT";
    case 3:
      return "PRODUCER";
    case 4:
      return "CONSUMER";
    default:
      return "INTERNAL";
  }
}

function resolveStatusCodeText(code: number): string {
  switch (code) {
    case 1:
      return "OK";
    case 2:
      return "ERROR";
    case 0:
    default:
      return "UNSET";
  }
}

function attributesToJsonValue(
  attributes: Record<string, unknown>,
): JsonValue {
  return Object.entries(attributes).reduce<Record<string, JsonValue>>((result, [key, value]) => {
    const converted = attributeValueToJsonValue(value);
    if (converted !== undefined) {
      result[key] = converted;
    }
    return result;
  }, {});
}

function attributeValueToJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const converted = value
      .map((entry) => attributeValueToJsonValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);

    return converted.length === value.length ? converted : undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, JsonValue>>((result, [key, entry]) => {
    const converted = attributeValueToJsonValue(entry);
    if (converted !== undefined) {
      result[key] = converted;
    }
    return result;
  }, {});
}

function compactJsonObject(
  value: Record<string, JsonValue | undefined>,
): JsonValue {
  return Object.entries(value).reduce<Record<string, JsonValue>>((result, [key, entry]) => {
    if (entry !== undefined) {
      result[key] = entry;
    }
    return result;
  }, {});
}

function cloneRequestOtelDebug(
  debug: RequestOtelDebug,
): RequestOtelDebug {
  return {
    ...(debug.pending !== undefined ? { pending: debug.pending } : {}),
    ...(debug.span !== undefined ? { span: cloneJsonValue(debug.span) } : {}),
    ...(debug.result ? { result: cloneRequestOtelExportResult(debug.result) } : {}),
  };
}

function cloneRequestOtelExportResult(
  result: RequestOtelExportResult,
): RequestOtelExportResult {
  return {
    ...result,
    ...(result.responseBody !== undefined
      ? { responseBody: cloneJsonValue(result.responseBody) }
      : {}),
  };
}

function cloneJsonValue<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
