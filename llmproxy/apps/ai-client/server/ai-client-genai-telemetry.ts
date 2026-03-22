import type {
  Attributes,
  SpanStatus,
  TimeInput,
} from "@opentelemetry/api";
import {
  SpanKind,
  SpanStatusCode,
} from "@opentelemetry/api";

import type {
  OtelTraceInput,
  OtelTracesService,
} from "../../otel/server/otel-capability";
import type { ConnectionConfig, JsonValue, RequestLogDetail, RequestOtelDebug } from "../../shared/type-api";
import { isRecord } from "../../shared/server/type-guards";
import { resolveRequestedCompletionLimit } from "./ai-client-diagnostic-http";

export const aiClientOtelScopeName = "llmproxy.ai-client";

interface GenAiCaptureOptions {
  captureMessageContent: boolean;
  captureToolContent: boolean;
}

type TraceAttributeValue = string | number | boolean | string[] | number[] | boolean[];

export function recordAiClientGenAiRequestTrace(
  traces: OtelTracesService,
  detail: RequestLogDetail,
  connection?: ConnectionConfig,
  onDebugUpdate?: (debug: RequestOtelDebug) => void,
): void {
  if (!traces.enabled) {
    return;
  }

  const span = buildAiClientGenAiRequestTrace(detail, connection, {
    captureMessageContent: traces.captureMessageContent,
    captureToolContent: traces.captureToolContent,
  });

  traces.record(
    aiClientOtelScopeName,
    span,
    onDebugUpdate
      ? {
        requestId: detail.entry.id,
        span: buildAiClientGenAiRequestTraceDebugSpan(span),
        onUpdate: onDebugUpdate,
      }
      : undefined,
  );
}

export function buildAiClientGenAiRequestTrace(
  detail: RequestLogDetail,
  connection: ConnectionConfig | undefined,
  capture: GenAiCaptureOptions,
): OtelTraceInput {
  const { entry, requestBody, responseBody } = detail;
  const request = asRecord(requestBody);
  const response = asRecord(responseBody);
  const operationName = resolveOperationName(entry.path);
  const requestModel = readString(request?.model) ?? entry.model;
  const responseModel = readString(response?.model) ?? requestModel;
  const endTime = toTraceEndTime(entry.time);
  const startTime = endTime - Math.max(0, entry.latencyMs);

  return {
    name: buildSpanName(operationName, requestModel),
    kind: SpanKind.CLIENT,
    startTime,
    endTime,
    status: resolveSpanStatus(detail),
    attributes: compactTraceAttributes({
      "gen_ai.operation.name": operationName,
      "gen_ai.provider.name": resolveProviderName(connection),
      "gen_ai.conversation.id": resolveConversationId(requestBody, responseBody),
      "gen_ai.request.model": requestModel,
      "gen_ai.response.model": responseModel,
      "gen_ai.request.max_tokens": resolveRequestedCompletionLimit(requestBody),
      "gen_ai.request.choice.count": readChoiceCount(requestBody),
      "gen_ai.request.seed": readPositiveInteger(request?.seed),
      "gen_ai.request.frequency_penalty": readNumber(request?.frequency_penalty),
      "gen_ai.request.presence_penalty": readNumber(request?.presence_penalty),
      "gen_ai.request.temperature": readNumber(request?.temperature),
      "gen_ai.request.top_p": readNumber(request?.top_p),
      "gen_ai.request.top_k": readNumber(request?.top_k),
      "gen_ai.request.stop_sequences": readStopSequences(requestBody),
      "gen_ai.output.type": resolveOutputType(requestBody),
      "gen_ai.response.finish_reasons": resolveFinishReasons(detail),
      "gen_ai.response.id": readString(response?.id),
      "gen_ai.usage.input_tokens": resolveUsageInputTokens(detail),
      "gen_ai.usage.output_tokens": resolveUsageOutputTokens(detail),
      "gen_ai.usage.cache_creation.input_tokens": resolveUsageCacheCreationInputTokens(responseBody),
      "gen_ai.usage.cache_read.input_tokens": resolveUsageCacheReadInputTokens(responseBody),
      "server.address": resolveServerAddress(connection),
      "server.port": resolveServerPort(connection),
      "http.request.method": entry.method,
      "url.path": entry.path,
      "http.response.status_code": entry.statusCode,
      "error.type": resolveErrorType(detail),
      "llmproxy.request.id": entry.id,
      "llmproxy.request.outcome": entry.outcome,
      "llmproxy.request.latency_ms": entry.latencyMs,
      "llmproxy.request.queued_ms": entry.queuedMs,
      "llmproxy.request.metrics_exact": entry.metricsExact,
      "llmproxy.energy.usage.wh": entry.energyUsageWh,
      "llmproxy.routing.middleware.id": entry.routingMiddlewareId,
      "llmproxy.routing.middleware.profile": entry.routingMiddlewareProfile,
      "llmproxy.connection.id": connection?.id,
      "llmproxy.connection.name": connection?.name,
      "llmproxy.connection.connector": connection?.connector ?? "openai",
      "llmproxy.diagnostic.severity": entry.diagnosticSeverity,
      "llmproxy.diagnostic.title": entry.diagnosticTitle,
      "llmproxy.diagnostic.summary": entry.diagnosticSummary,
      ...(capture.captureMessageContent
        ? {
          "gen_ai.input.messages": serializeJsonValue(buildInputMessages(requestBody, capture.captureToolContent)),
          "gen_ai.output.messages": serializeJsonValue(buildOutputMessages(responseBody, capture.captureToolContent)),
          "gen_ai.system_instructions": serializeJsonValue(buildSystemInstructions(requestBody)),
        }
        : {}),
      ...(capture.captureToolContent
        ? {
          "gen_ai.tool.definitions": serializeJsonValue(buildToolDefinitions(requestBody)),
        }
        : {}),
    }),
  };
}

export function buildAiClientGenAiRequestTraceDebugSpan(
  span: OtelTraceInput,
): JsonValue {
  return compactJsonObject({
    name: span.name,
    kind: span.kind !== undefined ? resolveSpanKindText(span.kind) : undefined,
    startTime: serializeTraceTime(span.startTime),
    endTime: serializeTraceTime(span.endTime),
    status: span.status
      ? compactJsonObject({
        code: resolveSpanStatusCodeText(span.status.code),
        ...(span.status.message ? { message: span.status.message } : {}),
      })
      : undefined,
    attributes: span.attributes ? traceAttributesToJsonValue(span.attributes) : undefined,
  });
}

function toTraceEndTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function serializeTraceTime(value: TimeInput | undefined): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value) && value.length === 2) {
    const [seconds, nanos] = value;
    if (typeof seconds === "number" && typeof nanos === "number") {
      return new Date((seconds * 1_000) + (nanos / 1_000_000)).toISOString();
    }
  }

  return undefined;
}

function resolveSpanKindText(kind: SpanKind): string {
  switch (kind) {
    case SpanKind.CLIENT:
      return "CLIENT";
    case SpanKind.SERVER:
      return "SERVER";
    case SpanKind.PRODUCER:
      return "PRODUCER";
    case SpanKind.CONSUMER:
      return "CONSUMER";
    case SpanKind.INTERNAL:
    default:
      return "INTERNAL";
  }
}

function resolveSpanStatusCodeText(code: SpanStatus["code"]): string {
  switch (code) {
    case SpanStatusCode.OK:
      return "OK";
    case SpanStatusCode.ERROR:
      return "ERROR";
    case SpanStatusCode.UNSET:
    default:
      return "UNSET";
  }
}

function buildInputMessages(
  requestBody: JsonValue | undefined,
  captureToolContent: boolean,
): JsonValue[] | undefined {
  const body = asRecord(requestBody);
  if (!body || !Array.isArray(body.messages)) {
    return undefined;
  }

  const messages = body.messages
    .map((message) => buildOpenAiMessage(message, captureToolContent))
    .filter((message): message is Record<string, JsonValue> => Boolean(message));

  return messages.length > 0 ? messages : undefined;
}

function buildOutputMessages(
  responseBody: JsonValue | undefined,
  captureToolContent: boolean,
): JsonValue[] | undefined {
  const response = asRecord(responseBody);
  const choices = Array.isArray(response?.choices) ? response.choices : undefined;
  if (!choices || choices.length === 0) {
    return undefined;
  }

  const messages = choices
    .map((choice) => buildOpenAiChoice(choice, captureToolContent))
    .filter((message): message is Record<string, JsonValue> => Boolean(message));

  return messages.length > 0 ? messages : undefined;
}

function buildSystemInstructions(
  requestBody: JsonValue | undefined,
): JsonValue[] | undefined {
  const body = asRecord(requestBody);
  if (!body) {
    return undefined;
  }

  const explicitInstructions = normalizeInstructionParts(
    body.system_instruction
      ?? body.systemInstructions
      ?? body.instructions,
  );

  return explicitInstructions?.length ? explicitInstructions : undefined;
}

function buildToolDefinitions(
  requestBody: JsonValue | undefined,
): JsonValue[] | undefined {
  const body = asRecord(requestBody);
  if (!body || !Array.isArray(body.tools)) {
    return undefined;
  }

  const tools = body.tools
    .map((tool) => normalizeToolDefinition(tool))
    .filter((tool): tool is JsonValue => tool !== undefined);

  return tools.length > 0 ? tools : undefined;
}

function buildOpenAiMessage(
  value: unknown,
  captureToolContent: boolean,
): Record<string, JsonValue> | undefined {
  const message = asRecord(value);
  if (!message) {
    return undefined;
  }

  const parts = buildOpenAiMessageParts(message, captureToolContent);
  if (parts.length === 0) {
    return undefined;
  }

  return compactJsonObject({
    role: readString(message.role) ?? "user",
    parts,
  }) as Record<string, JsonValue>;
}

function buildOpenAiChoice(
  value: unknown,
  captureToolContent: boolean,
): Record<string, JsonValue> | undefined {
  const choice = asRecord(value);
  if (!choice) {
    return undefined;
  }

  const message = asRecord(choice.message);
  const text = readString(choice.text);
  const parts = message
    ? buildOpenAiMessageParts(message, captureToolContent)
    : text
      ? [compactJsonObject({
        type: "text",
        content: text,
      })]
      : [];

  if (parts.length === 0) {
    return undefined;
  }

  return compactJsonObject({
    role: message ? readString(message.role) ?? "assistant" : "assistant",
    parts,
    finish_reason: normalizeMessageFinishReason(readString(choice.finish_reason)),
  }) as Record<string, JsonValue>;
}

function buildOpenAiMessageParts(
  message: Record<string, unknown>,
  captureToolContent: boolean,
): Record<string, JsonValue>[] {
  const parts: Record<string, JsonValue>[] = [];
  const content = message.content;

  if (typeof content === "string" && content.length > 0) {
    parts.push(compactJsonObject({
      type: "text",
      content,
    }) as Record<string, JsonValue>);
  }

  if (Array.isArray(content)) {
    for (const item of content) {
      const part = buildOpenAiContentPart(item, captureToolContent);
      if (part) {
        parts.push(part);
      }
    }
  }

  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  for (const toolCall of toolCalls) {
    const record = asRecord(toolCall);
    const functionRecord = asRecord(record?.function);
    if (!record || !functionRecord) {
      continue;
    }

    parts.push(compactJsonObject({
      type: "tool_call",
      id: readString(record.id),
      name: readString(functionRecord.name),
      ...(captureToolContent
        ? { arguments: parseJsonString(readString(functionRecord.arguments)) }
        : {}),
    }) as Record<string, JsonValue>);
  }

  if (readString(message.role) === "tool") {
    parts.push(compactJsonObject({
      type: "tool_call_response",
      id: readString(message.tool_call_id),
      ...(captureToolContent
        ? { result: asJsonValue(content) }
        : {}),
    }) as Record<string, JsonValue>);
  }

  return parts.filter((part) => Object.keys(part).length > 1 || part.type === "text");
}

function buildOpenAiContentPart(
  value: unknown,
  captureToolContent: boolean,
): Record<string, JsonValue> | undefined {
  const part = asRecord(value);
  if (!part) {
    return undefined;
  }

  const type = readString(part.type);
  if (!type) {
    return undefined;
  }

  if (type === "text" || type === "input_text") {
    const content = readString(part.text) ?? readString(part.content);
    return content
      ? compactJsonObject({
        type: "text",
        content,
      }) as Record<string, JsonValue>
      : undefined;
  }

  if (type === "image_url" || type === "input_image") {
    const imageUrl = asRecord(part.image_url);
    const content = readString(imageUrl?.url) ?? readString(part.url);
    return content
      ? compactJsonObject({
        type: "uri",
        uri: content,
        modality: "image",
      }) as Record<string, JsonValue>
      : undefined;
  }

  if (type === "tool_call") {
    return compactJsonObject({
      type: "tool_call",
      id: readString(part.id),
      name: readString(part.name),
      ...(captureToolContent
        ? { arguments: asJsonValue(part.arguments) }
        : {}),
    }) as Record<string, JsonValue>;
  }

  return undefined;
}

function normalizeToolDefinition(
  value: unknown,
): JsonValue | undefined {
  const tool = asRecord(value);
  if (!tool) {
    return undefined;
  }

  const type = readString(tool.type);
  const functionRecord = asRecord(tool.function);

  if (type === "function" && functionRecord) {
    return compactJsonObject({
      type,
      name: readString(functionRecord.name),
      description: readString(functionRecord.description),
      parameters: asJsonValue(functionRecord.parameters),
      strict: typeof functionRecord.strict === "boolean" ? functionRecord.strict : undefined,
    });
  }

  return asJsonValue(tool);
}

function normalizeMessageFinishReason(
  value: string | undefined,
): string | undefined {
  switch (value) {
    case "tool_calls":
      return "tool_call";
    default:
      return value;
  }
}

function resolveOperationName(pathname: string): string {
  switch (pathname) {
    case "/v1/chat/completions":
      return "chat";
    case "/v1/completions":
      return "text_completion";
    case "/v1/embeddings":
      return "embeddings";
    default:
      return "proxy_request";
  }
}

function buildSpanName(
  operationName: string,
  requestModel: string | undefined,
): string {
  return requestModel
    ? `${operationName} ${requestModel}`
    : operationName;
}

function resolveProviderName(connection?: ConnectionConfig): string | undefined {
  switch (connection?.connector ?? "openai") {
    case "openai":
      return "openai";
    case "ollama":
      return "ollama";
    case "llama.cpp":
      return "llama.cpp";
    default:
      return undefined;
  }
}

function resolveOutputType(requestBody: JsonValue | undefined): string | undefined {
  const responseFormat = asRecord(asRecord(requestBody)?.response_format);
  const type = readString(responseFormat?.type);
  if (type === "json_object" || type === "json_schema") {
    return "json";
  }

  if (type === "text") {
    return "text";
  }

  return undefined;
}

function resolveFinishReasons(detail: RequestLogDetail): string[] | undefined {
  const response = asRecord(detail.responseBody);
  const choices = Array.isArray(response?.choices) ? response.choices : [];
  const reasons = choices
    .map((choice) => readString(asRecord(choice)?.finish_reason))
    .filter((reason): reason is string => Boolean(reason));

  if (reasons.length > 0) {
    return reasons;
  }

  return detail.entry.finishReason ? [detail.entry.finishReason] : undefined;
}

function resolveServerAddress(connection?: ConnectionConfig): string | undefined {
  const url = tryParseUrl(connection?.baseUrl);
  return url?.hostname;
}

function resolveServerPort(connection?: ConnectionConfig): number | undefined {
  const url = tryParseUrl(connection?.baseUrl);
  if (!url) {
    return undefined;
  }

  if (url.port) {
    return Number(url.port);
  }

  if (url.protocol === "https:") {
    return 443;
  }

  if (url.protocol === "http:") {
    return 80;
  }

  return undefined;
}

function resolveErrorType(detail: RequestLogDetail): string | undefined {
  const { entry } = detail;

  if (entry.outcome === "cancelled") {
    return "cancelled";
  }

  if (entry.outcome === "queued_timeout") {
    return "queue_timeout";
  }

  if (entry.outcome !== "error") {
    return undefined;
  }

  if (typeof entry.statusCode === "number") {
    return String(entry.statusCode);
  }

  const message = entry.error?.toLowerCase() ?? "";
  if (message.includes("timeout")) {
    return "timeout";
  }

  return "_OTHER";
}

function resolveSpanStatus(detail: RequestLogDetail): SpanStatus {
  const { entry } = detail;

  if (entry.outcome === "success") {
    return {
      code: SpanStatusCode.UNSET,
    };
  }

  return {
    code: SpanStatusCode.ERROR,
    ...(entry.error ? { message: entry.error } : {}),
  };
}

function readChoiceCount(requestBody: JsonValue | undefined): number | undefined {
  const count = readPositiveInteger(asRecord(requestBody)?.n);
  return count && count !== 1 ? count : undefined;
}

function readStopSequences(requestBody: JsonValue | undefined): string[] | undefined {
  const stop = asRecord(requestBody)?.stop;
  if (typeof stop === "string" && stop.length > 0) {
    return [stop];
  }

  if (!Array.isArray(stop)) {
    return undefined;
  }

  const sequences = stop.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  return sequences.length > 0 ? sequences : undefined;
}

function resolveConversationId(
  requestBody: JsonValue | undefined,
  responseBody: JsonValue | undefined,
): string | undefined {
  const request = asRecord(requestBody);
  const response = asRecord(responseBody);

  return readString(
    request?.conversation_id
      ?? request?.conversationId
      ?? request?.thread_id
      ?? request?.threadId
      ?? response?.conversation_id
      ?? response?.conversationId
      ?? response?.thread_id
      ?? response?.threadId,
  );
}

function resolveUsageInputTokens(detail: RequestLogDetail): number | undefined {
  const responseUsage = asRecord(asRecord(detail.responseBody)?.usage);
  return readNonNegativeInteger(responseUsage?.prompt_tokens) ?? detail.entry.promptTokens;
}

function resolveUsageOutputTokens(detail: RequestLogDetail): number | undefined {
  const responseUsage = asRecord(asRecord(detail.responseBody)?.usage);
  return readNonNegativeInteger(responseUsage?.completion_tokens) ?? detail.entry.completionTokens;
}

function resolveUsageCacheCreationInputTokens(
  responseBody: JsonValue | undefined,
): number | undefined {
  const usage = asRecord(asRecord(responseBody)?.usage);
  const promptDetails = asRecord(usage?.prompt_tokens_details);

  return readNonNegativeInteger(
    promptDetails?.cache_creation_tokens
      ?? usage?.cache_creation_input_tokens,
  );
}

function resolveUsageCacheReadInputTokens(
  responseBody: JsonValue | undefined,
): number | undefined {
  const usage = asRecord(asRecord(responseBody)?.usage);
  const promptDetails = asRecord(usage?.prompt_tokens_details);

  return readNonNegativeInteger(
    promptDetails?.cached_tokens
      ?? usage?.cache_read_input_tokens,
  );
}

function compactTraceAttributes(
  attributes: Record<string, TraceAttributeValue | undefined>,
): Attributes {
  return Object.entries(attributes).reduce<Attributes>((result, [key, value]) => {
    if (value !== undefined) {
      result[key] = value;
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

function traceAttributesToJsonValue(
  value: Attributes,
): JsonValue {
  return Object.entries(value).reduce<Record<string, JsonValue>>((result, [key, entry]) => {
    const jsonValue = attributeValueToJsonValue(entry as TraceAttributeValue | undefined);
    if (jsonValue !== undefined) {
      result[key] = jsonValue;
    }
    return result;
  }, {});
}

function attributeValueToJsonValue(
  value: TraceAttributeValue | undefined,
): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return value.map((entry) => entry as JsonValue);
}

function serializeJsonValue(value: JsonValue | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.stringify(value);
}

function parseJsonString(value: string | undefined): JsonValue | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return value;
  }
}

function tryParseUrl(value: string | undefined): URL | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asJsonValue(value: unknown): JsonValue | undefined {
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
      .map((entry) => asJsonValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);
    return converted.length === value.length ? converted : undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return Object.entries(value).reduce<Record<string, JsonValue>>((result, [key, entry]) => {
    const converted = asJsonValue(entry);
    if (converted !== undefined) {
      result[key] = converted;
    }
    return result;
  }, {});
}

function normalizeInstructionParts(value: unknown): JsonValue[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string" && value.length > 0) {
    return [compactJsonObject({
      type: "text",
      content: value,
    })];
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => normalizeInstructionPart(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);

    return parts.length > 0 ? parts : undefined;
  }

  const part = normalizeInstructionPart(value);
  return part !== undefined ? [part] : undefined;
}

function normalizeInstructionPart(value: unknown): JsonValue | undefined {
  if (typeof value === "string" && value.length > 0) {
    return compactJsonObject({
      type: "text",
      content: value,
    });
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const text = readString(value.text) ?? readString(value.content);
  if (text) {
    return compactJsonObject({
      type: "text",
      content: text,
    });
  }

  return asJsonValue(value);
}
