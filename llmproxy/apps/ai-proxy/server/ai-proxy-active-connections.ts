import { cloneJsonForRetention, compactJsonForRetention } from "../../shared/server/retained-json";
import {
  resolveEffectiveCompletionTokenLimit,
  resolveModelCompletionLimit,
  resolveRequestedCompletionLimit,
} from "../../ai-client/server/ai-client-capability";
import { isErrorStatus } from "./utils/proxy-error-utils";
import type { ActiveConnectionRuntime } from "./ai-proxy-types";
import type {
  ActiveConnectionKind,
  ActiveConnectionSnapshot,
  JsonValue,
  LeaseReleaseResult,
  ProxyRouteRequest,
  ProxySnapshot,
  RequestLogDetail,
} from "../../shared/type-api";
import type { StreamingAccumulator, StreamingAccumulatorUpdate } from "./utils/streaming";

export function createActiveConnection(
  route: ProxyRouteRequest,
  kind: ActiveConnectionKind,
  upstreamStream: boolean,
): ActiveConnectionRuntime {
  return {
    id: route.id,
    kind,
    method: route.method,
    path: route.path,
    clientIp: route.clientIp,
    model: route.model,
    routingMiddlewareId: route.routingMiddlewareId,
    routingMiddlewareProfile: route.routingMiddlewareProfile,
    clientStream: route.stream,
    upstreamStream,
    phase: "queued",
    receivedAt: route.receivedAt,
    lastUpdatedAt: route.receivedAt,
    queueMs: 0,
    contentTokens: 0,
    reasoningTokens: 0,
    textTokens: 0,
    metricsExact: false,
    energyUsageWh: undefined,
    requestedCompletionTokenLimit: resolveRequestedCompletionLimit(route.requestBody),
    requestBody: cloneJsonForRetention(route.requestBody),
  };
}

export function patchActiveConnection(
  connection: ActiveConnectionRuntime,
  patch: Partial<Omit<ActiveConnectionRuntime, "id" | "receivedAt">>,
  now = Date.now(),
): void {
  Object.assign(connection, patch);
  connection.lastUpdatedAt = now;
}

export function applyStreamingUpdateToConnection(
  connection: ActiveConnectionRuntime,
  update: StreamingAccumulatorUpdate,
  responseBody?: Record<string, unknown>,
  now = Date.now(),
): void {
  if (update.addedCompletionTokens > 0 && !connection.firstTokenAt) {
    connection.firstTokenAt = now;
  }

  if (update.addedCompletionTokens > 0 || connection.phase === "connected") {
    connection.phase = "streaming";
  }

  connection.promptTokens = update.metrics.promptTokens;
  connection.completionTokens = update.metrics.completionTokens;
  connection.totalTokens = update.metrics.totalTokens;
  connection.contentTokens = update.metrics.contentTokens;
  connection.reasoningTokens = update.metrics.reasoningTokens;
  connection.textTokens = update.metrics.textTokens;
  connection.promptMs = update.metrics.promptMs;
  connection.generationMs = update.metrics.generationMs;
  connection.promptTokensPerSecond = update.metrics.promptTokensPerSecond;
  connection.completionTokensPerSecond = update.metrics.completionTokensPerSecond;
  connection.finishReason = update.finishReason ?? update.metrics.finishReason;
  connection.metricsExact = update.metrics.exact;
  if (responseBody !== undefined) {
    connection.responseBody = compactJsonForRetention(responseBody as JsonValue | undefined);
  }
  connection.lastUpdatedAt = now;
}

export function buildReleaseMetricsForConnection(
  connection: ActiveConnectionRuntime | undefined,
  backends: ProxySnapshot["backends"],
  now = Date.now(),
): Partial<LeaseReleaseResult> {
  if (!connection) {
    return {};
  }

  const completionTokens = connection.completionTokens;
  const completionTokensPerSecond = resolveLiveCompletionRate(connection, now);
  const effectiveCompletionTokenLimit = resolveConnectionCompletionTokenLimit(connection, backends);

  return {
    promptTokens: connection.promptTokens,
    completionTokens,
    totalTokens: connection.totalTokens,
    contentTokens: connection.contentTokens,
    reasoningTokens: connection.reasoningTokens,
    textTokens: connection.textTokens,
    promptMs: connection.promptMs,
    generationMs: resolveLiveGenerationMs(connection, now),
    promptTokensPerSecond: connection.promptTokensPerSecond,
    completionTokensPerSecond,
    effectiveCompletionTokenLimit: effectiveCompletionTokenLimit ?? undefined,
    timeToFirstTokenMs: connection.firstTokenAt ? connection.firstTokenAt - connection.receivedAt : undefined,
    finishReason: connection.finishReason,
    metricsExact: connection.metricsExact,
    energyUsageWh: connection.energyUsageWh,
    responseBody: resolveConnectionResponseBody(connection),
  };
}

export function buildActiveConnectionSnapshot(
  connection: ActiveConnectionRuntime,
  backends: ProxySnapshot["backends"],
  now = Date.now(),
): ActiveConnectionSnapshot {
  const elapsedMs = Math.max(0, now - connection.receivedAt);
  const completionTokens = connection.completionTokens;
  const effectiveCompletionTokenLimit = resolveConnectionCompletionTokenLimit(connection, backends);

  return {
    id: connection.id,
    kind: connection.kind,
    method: connection.method,
    path: connection.path,
    clientIp: connection.clientIp,
    model: connection.model,
    routingMiddlewareId: connection.routingMiddlewareId,
    routingMiddlewareProfile: connection.routingMiddlewareProfile,
    clientStream: connection.clientStream,
    upstreamStream: connection.upstreamStream,
    phase: connection.phase,
    startedAt: new Date(connection.receivedAt).toISOString(),
    elapsedMs,
    queueMs: connection.queueMs,
    backendId: connection.backendId,
    backendName: connection.backendName,
    statusCode: connection.statusCode,
    error: connection.error,
    promptTokens: connection.promptTokens,
    completionTokens,
    totalTokens: connection.totalTokens,
    contentTokens: connection.contentTokens,
    reasoningTokens: connection.reasoningTokens,
    textTokens: connection.textTokens,
    promptMs: connection.promptMs,
    generationMs: resolveLiveGenerationMs(connection, now),
    promptTokensPerSecond: connection.promptTokensPerSecond,
    completionTokensPerSecond: resolveLiveCompletionRate(connection, now),
    effectiveCompletionTokenLimit: effectiveCompletionTokenLimit ?? undefined,
    energyUsageWh: connection.energyUsageWh,
    timeToFirstTokenMs: connection.firstTokenAt ? connection.firstTokenAt - connection.receivedAt : undefined,
    finishReason: connection.finishReason,
    metricsExact: connection.metricsExact,
    hasDetail: connection.requestBody !== undefined || connection.responseBody !== undefined,
  };
}

export function buildActiveRequestDetail(
  connection: ActiveConnectionRuntime,
  backends: ProxySnapshot["backends"],
  now = Date.now(),
): RequestLogDetail {
  const snapshot = buildActiveConnectionSnapshot(connection, backends, now);

  return {
    live: true,
    entry: {
      id: snapshot.id,
      time: snapshot.startedAt,
      method: snapshot.method,
      path: snapshot.path,
      clientIp: snapshot.clientIp,
      requestType: snapshot.clientStream ? "stream" : "json",
      model: snapshot.model,
      routingMiddlewareId: snapshot.routingMiddlewareId,
      routingMiddlewareProfile: snapshot.routingMiddlewareProfile,
      backendId: snapshot.backendId,
      backendName: snapshot.backendName,
      outcome: connection.cancelSource === "dashboard" || connection.cancelSource === "client_disconnect"
        ? "cancelled"
        : (snapshot.error || isErrorStatus(snapshot.statusCode) ? "error" : "success"),
      latencyMs: snapshot.elapsedMs,
      queuedMs: snapshot.queueMs,
      statusCode: snapshot.statusCode,
      error: snapshot.error,
      promptTokens: snapshot.promptTokens,
      completionTokens: snapshot.completionTokens,
      totalTokens: snapshot.totalTokens,
      contentTokens: snapshot.contentTokens,
      reasoningTokens: snapshot.reasoningTokens,
      textTokens: snapshot.textTokens,
      promptMs: snapshot.promptMs,
      generationMs: snapshot.generationMs,
      promptTokensPerSecond: snapshot.promptTokensPerSecond,
      completionTokensPerSecond: snapshot.completionTokensPerSecond,
      effectiveCompletionTokenLimit: snapshot.effectiveCompletionTokenLimit,
      energyUsageWh: snapshot.energyUsageWh,
      timeToFirstTokenMs: snapshot.timeToFirstTokenMs,
      finishReason: snapshot.finishReason,
      metricsExact: snapshot.metricsExact,
      hasDetail: snapshot.hasDetail,
    },
    requestBody: connection.requestBody,
    responseBody: resolveConnectionResponseBody(connection),
  };
}

function resolveConnectionCompletionTokenLimit(
  connection: ActiveConnectionRuntime,
  backends: ProxySnapshot["backends"],
): number | undefined {
  return resolveEffectiveCompletionTokenLimit(
    connection.requestedCompletionTokenLimit,
    resolveModelCompletionLimit(connection.model, connection.backendId, backends),
  );
}

function resolveLiveCompletionRate(connection: ActiveConnectionRuntime, now: number): number | undefined {
  const completionTokens = connection.completionTokens;

  return connection.completionTokensPerSecond
    ?? (connection.firstTokenAt && completionTokens && completionTokens > 0
      ? completionTokens / Math.max(0.001, (now - connection.firstTokenAt) / 1000)
      : undefined);
}

function resolveLiveGenerationMs(connection: ActiveConnectionRuntime, now: number): number | undefined {
  return connection.generationMs ?? (connection.firstTokenAt ? now - connection.firstTokenAt : undefined);
}

function resolveConnectionResponseBody(connection: ActiveConnectionRuntime): JsonValue | undefined {
  if (connection.responseBody !== undefined) {
    return connection.responseBody;
  }

  if (connection.streamingAccumulator?.hasPayload) {
    return connection.streamingAccumulator.buildResponse() as JsonValue;
  }

  return undefined;
}
