import { cloneJsonForRetention } from "../../shared/server/retained-json";
import {
  AiClientConfig,
  LeaseReleaseResult,
  ProxyRouteRequest,
  ProxySnapshot,
  RequestLogDetail,
  RequestLogEntry,
  RequestOtelDebug,
} from "../../shared/type-api";
import { buildDiagnosticReport, selectPrimaryDiagnosticIssue } from "./ai-client-diagnostics-core";

interface AiClientRequestLogStoreOptions {
  getRecentRequestLimit: () => number;
  getSnapshot: () => ProxySnapshot;
  resolveConnection: (backendId: string) => AiClientConfig["connections"][number] | undefined;
  requestLogWriter?: (line: string) => void;
  requestLogObserver?: (
    detail: RequestLogDetail,
    connection?: AiClientConfig["connections"][number],
  ) => void;
  onDetailUpdated?: (requestId: string) => void;
}

export class AiClientRequestLogStore {
  private readonly getRecentRequestLimit: () => number;
  private readonly getSnapshot: () => ProxySnapshot;
  private readonly resolveConnection: (
    backendId: string,
  ) => AiClientConfig["connections"][number] | undefined;
  private readonly requestLogWriter: (line: string) => void;
  private readonly requestLogObserver: (
    detail: RequestLogDetail,
    connection?: AiClientConfig["connections"][number],
  ) => void;
  private readonly onDetailUpdated: (requestId: string) => void;
  private recentRequests: RequestLogEntry[] = [];
  private readonly recentRequestDetails = new Map<string, Omit<RequestLogDetail, "entry">>();
  private readonly diagnosedRequestIds = new Set<string>();

  public constructor(options: AiClientRequestLogStoreOptions) {
    this.getRecentRequestLimit = options.getRecentRequestLimit;
    this.getSnapshot = options.getSnapshot;
    this.resolveConnection = options.resolveConnection;
    this.requestLogWriter = options.requestLogWriter ?? (() => {});
    this.requestLogObserver = options.requestLogObserver ?? (() => {});
    this.onDetailUpdated = options.onDetailUpdated ?? (() => {});
  }

  public listEntries(): RequestLogEntry[] {
    return [...this.recentRequests];
  }

  public getDetail(id: string): RequestLogDetail | undefined {
    const entry = this.recentRequests.find((candidate) => candidate.id === id);

    if (!entry) {
      return undefined;
    }

    const detail = this.recentRequestDetails.get(id);
    return {
      entry: { ...entry },
      requestBody: detail?.requestBody,
      responseBody: detail?.responseBody,
      otel: cloneRequestOtelDebug(detail?.otel),
    };
  }

  public getRetainedDetailBodies(id: string): Omit<RequestLogDetail, "entry"> | undefined {
    const detail = this.recentRequestDetails.get(id);
    if (!detail) {
      return undefined;
    }

    return {
      requestBody: detail.requestBody,
      responseBody: detail.responseBody,
      otel: cloneRequestOtelDebug(detail.otel),
    };
  }

  public getRetainedDetailCount(): number {
    return this.recentRequestDetails.size;
  }

  public getDiagnosedRequestCount(): number {
    return this.diagnosedRequestIds.size;
  }

  public trimToLimit(): void {
    this.recentRequests = this.recentRequests.slice(0, this.getRecentRequestLimit());

    const activeIds = new Set(this.recentRequests.map((entry) => entry.id));
    for (const id of Array.from(this.recentRequestDetails.keys())) {
      if (!activeIds.has(id)) {
        this.recentRequestDetails.delete(id);
      }
    }

    for (const id of Array.from(this.diagnosedRequestIds)) {
      if (!activeIds.has(id)) {
        this.diagnosedRequestIds.delete(id);
      }
    }
  }

  public record(
    entry: RequestLogEntry,
    requestBody: ProxyRouteRequest["requestBody"],
    responseBody: LeaseReleaseResult["responseBody"],
  ): void {
    this.annotateRequestDiagnosticsOnce(entry, requestBody, responseBody);
    this.recentRequests.unshift(entry);
    this.trimToLimit();
    this.storeRecentRequestDetail(entry.id, requestBody, responseBody);
    this.emitFinalRequestLogLine(entry.id);
    this.onDetailUpdated(entry.id);
  }

  public mergeOtelDebug(
    requestId: string,
    otel: RequestOtelDebug,
  ): void {
    const entry = this.recentRequests.find((candidate) => candidate.id === requestId);
    if (!entry) {
      return;
    }

    const current = this.recentRequestDetails.get(requestId);
    this.recentRequestDetails.set(requestId, {
      requestBody: current?.requestBody,
      responseBody: current?.responseBody,
      otel: cloneRequestOtelDebug(otel),
    });
    entry.hasDetail = true;
    this.onDetailUpdated(requestId);
  }

  private storeRecentRequestDetail(
    requestId: string,
    requestBody: ProxyRouteRequest["requestBody"],
    responseBody: LeaseReleaseResult["responseBody"],
  ): void {
    if (requestBody !== undefined || responseBody !== undefined) {
      this.recentRequestDetails.set(requestId, {
        requestBody: cloneJsonForRetention(requestBody),
        responseBody: cloneJsonForRetention(responseBody),
        otel: this.recentRequestDetails.get(requestId)?.otel,
      });
    } else {
      this.recentRequestDetails.delete(requestId);
    }

    this.trimToLimit();
  }

  private emitFinalRequestLogLine(requestId: string): void {
    const detail = this.getDetail(requestId);
    if (!detail) {
      return;
    }

    try {
      this.requestLogWriter(JSON.stringify(detail.entry));
    } catch (error) {
      console.error(`Failed to write request log line for ${requestId}:`, error);
    }

    const connection = detail.entry.backendId
      ? this.resolveConnection(detail.entry.backendId)
      : undefined;

    try {
      this.requestLogObserver(
        detail,
        connection ? cloneConnectionConfig(connection) : undefined,
      );
    } catch (error) {
      console.error(`Failed to observe request log detail for ${requestId}:`, error);
    }
  }

  private annotateRequestDiagnosticsOnce(
    entry: RequestLogEntry,
    requestBody: ProxyRouteRequest["requestBody"],
    responseBody: LeaseReleaseResult["responseBody"],
  ): void {
    if (this.diagnosedRequestIds.has(entry.id)) {
      return;
    }

    // The automatic post-request heuristic check should run exactly once per
    // retained request. Later UIs reuse these stored summary fields instead of
    // recomputing them for the request list on every render.
    const report = buildDiagnosticReport(
      {
        entry: { ...entry },
        requestBody,
        responseBody,
      },
      this.getSnapshot(),
    );
    const issue = selectPrimaryDiagnosticIssue(report);

    if (!issue) {
      this.diagnosedRequestIds.add(entry.id);
      return;
    }

    entry.diagnosticSeverity = issue.severity;
    entry.diagnosticTitle = issue.title;
    entry.diagnosticSummary = issue.summary;
    this.diagnosedRequestIds.add(entry.id);
  }
}

function cloneConnectionConfig(
  connection: AiClientConfig["connections"][number],
): AiClientConfig["connections"][number] {
  return {
    ...connection,
    ...(connection.models ? { models: [...connection.models] } : {}),
    ...(connection.headers ? { headers: { ...connection.headers } } : {}),
  };
}

function cloneRequestOtelDebug(
  debug: RequestOtelDebug | undefined,
): RequestOtelDebug | undefined {
  if (!debug) {
    return undefined;
  }

  return {
    ...(debug.pending !== undefined ? { pending: debug.pending } : {}),
    ...(debug.span !== undefined ? { span: cloneJsonForRetention(debug.span) } : {}),
    ...(debug.result
      ? {
        result: {
          ...debug.result,
          ...(debug.result.responseBody !== undefined
            ? { responseBody: cloneJsonForRetention(debug.result.responseBody) }
            : {}),
        },
      }
      : {}),
  };
}
