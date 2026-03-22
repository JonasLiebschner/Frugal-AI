import type {
  ActiveConnectionSnapshot,
  ProxySnapshot,
  RequestLogEntry,
} from "../types/dashboard";

export type RequestCatalogOutcome = RequestLogEntry["outcome"] | "queued" | "connected" | "streaming";

export interface RequestCatalogRow {
  id: string;
  time: string;
  method: string;
  path: string;
  requestType?: "stream" | "json";
  model?: string;
  routingMiddlewareId?: string;
  routingMiddlewareProfile?: string;
  backendName?: string;
  backendId?: string;
  outcome: RequestCatalogOutcome;
  queuedMs: number;
  latencyMs: number;
  statusCode?: number;
  error?: string;
  completionTokens?: number;
  totalTokens?: number;
  contentTokens?: number;
  reasoningTokens?: number;
  textTokens?: number;
  completionTokensPerSecond?: number;
  effectiveCompletionTokenLimit?: number;
  energyUsageWh?: number;
  finishReason?: string;
  diagnosticSeverity?: "warn" | "bad";
  diagnosticTitle?: string;
  diagnosticSummary?: string;
  hasDetail: boolean;
  live: boolean;
}

export function normalizeRequestLogRow(entry: RequestLogEntry): RequestCatalogRow {
  return {
    id: entry.id,
    time: entry.time,
    method: entry.method,
    path: entry.path,
    requestType: entry.requestType,
    model: entry.model,
    routingMiddlewareId: entry.routingMiddlewareId,
    routingMiddlewareProfile: entry.routingMiddlewareProfile,
    backendName: entry.backendName,
    backendId: entry.backendId,
    outcome: entry.outcome,
    queuedMs: entry.queuedMs,
    latencyMs: entry.latencyMs,
    statusCode: entry.statusCode,
    error: entry.error,
    completionTokens: entry.completionTokens,
    totalTokens: entry.totalTokens,
    contentTokens: entry.contentTokens,
    reasoningTokens: entry.reasoningTokens,
    textTokens: entry.textTokens,
    completionTokensPerSecond: entry.completionTokensPerSecond,
    effectiveCompletionTokenLimit: entry.effectiveCompletionTokenLimit,
    energyUsageWh: entry.energyUsageWh,
    finishReason: entry.finishReason,
    diagnosticSeverity: entry.diagnosticSeverity,
    diagnosticTitle: entry.diagnosticTitle,
    diagnosticSummary: entry.diagnosticSummary,
    hasDetail: Boolean(entry.hasDetail),
    live: false,
  };
}

export function normalizeActiveConnectionRow(connection: ActiveConnectionSnapshot): RequestCatalogRow {
  return {
    id: connection.id,
    time: connection.startedAt,
    method: connection.method,
    path: connection.path,
    requestType: connection.clientStream ? "stream" : "json",
    model: connection.model,
    routingMiddlewareId: connection.routingMiddlewareId,
    routingMiddlewareProfile: connection.routingMiddlewareProfile,
    backendName: connection.backendName,
    backendId: connection.backendId,
    outcome: connection.phase,
    queuedMs: connection.phase === "queued" ? connection.elapsedMs : connection.queueMs,
    latencyMs: connection.elapsedMs,
    statusCode: connection.statusCode,
    error: connection.error,
    completionTokens: connection.completionTokens,
    totalTokens: connection.totalTokens,
    contentTokens: connection.contentTokens,
    reasoningTokens: connection.reasoningTokens,
    textTokens: connection.textTokens,
    completionTokensPerSecond: connection.completionTokensPerSecond,
    effectiveCompletionTokenLimit: connection.effectiveCompletionTokenLimit,
    energyUsageWh: connection.energyUsageWh,
    finishReason: connection.finishReason,
    diagnosticSeverity: undefined,
    diagnosticTitle: undefined,
    diagnosticSummary: undefined,
    hasDetail: Boolean(connection.hasDetail),
    live: true,
  };
}

export function buildRequestCatalog(
  snapshot: Pick<ProxySnapshot, "activeConnections" | "recentRequests">,
): RequestCatalogRow[] {
  const rows = new Map<string, RequestCatalogRow>();

  for (const connection of snapshot.activeConnections) {
    rows.set(connection.id, normalizeActiveConnectionRow(connection));
  }

  for (const entry of snapshot.recentRequests) {
    if (rows.has(entry.id)) {
      continue;
    }

    rows.set(entry.id, normalizeRequestLogRow(entry));
  }

  return Array.from(rows.values());
}
