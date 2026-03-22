import {
  AiClientConfig,
  LeaseReleaseResult,
  ProxyRouteRequest,
  RequestLogEntry,
} from "../../shared/type-api";
import { resolveRequestedCompletionLimit } from "./ai-client-diagnostic-http";

export interface AiClientLeaseRuntime {
  config: AiClientConfig["connections"][number];
  activeRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cancelledRequests: number;
  healthy: boolean;
  lastLatencyMs?: number;
  avgLatencyMs?: number;
  lastCheckedAt?: string;
  lastError?: string;
}

export function applyLeaseResult(
  runtime: AiClientLeaseRuntime,
  route: ProxyRouteRequest,
  selectedModel: string | undefined,
  result: LeaseReleaseResult,
): RequestLogEntry {
  runtime.activeRequests = Math.max(0, runtime.activeRequests - 1);
  runtime.lastLatencyMs = result.latencyMs;
  runtime.avgLatencyMs = updateAverageLatency(runtime, result.latencyMs);
  runtime.lastCheckedAt = new Date().toISOString();

  if (result.outcome === "success") {
    runtime.successfulRequests += 1;
    runtime.healthy = true;
    runtime.lastError = undefined;
  } else if (result.outcome === "cancelled") {
    runtime.cancelledRequests += 1;
    runtime.lastError = result.error;
  } else {
    runtime.failedRequests += 1;
    runtime.lastError = result.error;

    if (result.outcome === "error") {
      runtime.healthy = false;
    }
  }

  return {
    id: route.id,
    time: new Date().toISOString(),
    method: route.method,
    path: route.path,
    clientIp: route.clientIp,
    requestType: route.stream ? "stream" : "json",
    model: selectedModel ?? route.model,
    routingMiddlewareId: route.routingMiddlewareId,
    routingMiddlewareProfile: route.routingMiddlewareProfile,
    backendId: runtime.config.id,
    backendName: runtime.config.name,
    outcome: result.outcome,
    latencyMs: result.latencyMs,
    queuedMs: result.queuedMs,
    statusCode: result.statusCode,
    error: result.error,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
    contentTokens: result.contentTokens,
    reasoningTokens: result.reasoningTokens,
    textTokens: result.textTokens,
    promptMs: result.promptMs,
    generationMs: result.generationMs,
    promptTokensPerSecond: result.promptTokensPerSecond,
    completionTokensPerSecond: result.completionTokensPerSecond,
    effectiveCompletionTokenLimit: result.effectiveCompletionTokenLimit,
    energyUsageWh: result.energyUsageWh,
    timeToFirstTokenMs: result.timeToFirstTokenMs,
    finishReason: result.finishReason,
    metricsExact: result.metricsExact,
    hasDetail: route.requestBody !== undefined || result.responseBody !== undefined,
  };
}

export function buildRejectedRequestLogEntry(
  route: ProxyRouteRequest,
  error: string,
  outcome: RequestLogEntry["outcome"] = "error",
  queuedMs = 0,
): RequestLogEntry {
  return {
    id: route.id,
    time: new Date().toISOString(),
    method: route.method,
    path: route.path,
    clientIp: route.clientIp,
    requestType: route.stream ? "stream" : "json",
    model: route.model,
    routingMiddlewareId: route.routingMiddlewareId,
    routingMiddlewareProfile: route.routingMiddlewareProfile,
    outcome,
    latencyMs: Date.now() - route.receivedAt,
    queuedMs,
    error,
    effectiveCompletionTokenLimit: resolveRequestedCompletionLimit(route.requestBody),
    hasDetail: route.requestBody !== undefined,
  };
}

function updateAverageLatency(runtime: AiClientLeaseRuntime, latencyMs: number): number {
  const completedRequests =
    runtime.successfulRequests + runtime.failedRequests + runtime.cancelledRequests + 1;

  if (runtime.avgLatencyMs === undefined) {
    return latencyMs;
  }

  return Math.round(((runtime.avgLatencyMs * (completedRequests - 1)) + latencyMs) / completedRequests);
}
