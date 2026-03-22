import type {
  AiClientConfig,
  BackendRuntimeSnapshot,
  DiscoveredModelDetail,
} from "../../shared/type-api";
import { getBackendConnector } from "./ai-client-backend-connectors";
import { resolveConnectionHeaders } from "./ai-client-config";
import { getBackendMonitoringIntervalMs } from "./ai-client-health";

export interface AiClientBackendRuntime {
  config: AiClientConfig["connections"][number];
  resolvedHeaders: Record<string, string>;
  activeRequests: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cancelledRequests: number;
  healthy: boolean;
  lastLatencyMs?: number;
  avgLatencyMs?: number;
  lastCheckedAt?: string;
  lastError?: string;
  discoveredModels: string[];
  discoveredModelDetails: DiscoveredModelDetail[];
  nextHealthCheckAt: number;
}

export function replaceAiClientBackendRuntimes(
  previousBackends: AiClientBackendRuntime[],
  nextConfig: AiClientConfig,
  now = Date.now(),
): AiClientBackendRuntime[] {
  const previous = new Map(previousBackends.map((backend) => [backend.config.id, backend] as const));

  return nextConfig.connections.map((config) => {
    const existing = previous.get(config.id);

    return {
      config,
      resolvedHeaders: resolveConnectionHeaders(config),
      activeRequests: existing?.activeRequests ?? 0,
      totalRequests: existing?.totalRequests ?? 0,
      successfulRequests: existing?.successfulRequests ?? 0,
      failedRequests: existing?.failedRequests ?? 0,
      cancelledRequests: existing?.cancelledRequests ?? 0,
      healthy: existing?.healthy ?? config.enabled,
      lastLatencyMs: existing?.lastLatencyMs,
      avgLatencyMs: existing?.avgLatencyMs,
      lastCheckedAt: existing?.lastCheckedAt,
      lastError: existing?.lastError,
      discoveredModels: existing?.discoveredModels ?? [],
      discoveredModelDetails: existing?.discoveredModelDetails ?? [],
      nextHealthCheckAt: existing?.nextHealthCheckAt ?? now,
    };
  });
}

export function resolveAiClientBackendRuntime(
  backends: AiClientBackendRuntime[],
  id: string,
  fallback: AiClientBackendRuntime,
): AiClientBackendRuntime {
  return backends.find((backend) => backend.config.id === id) ?? fallback;
}

export function markAiClientBackendUnhealthy(
  backends: AiClientBackendRuntime[],
  id: string,
  error: string,
): AiClientBackendRuntime | undefined {
  const backend = backends.find((entry) => entry.config.id === id);
  if (!backend) {
    return undefined;
  }

  backend.healthy = false;
  backend.lastCheckedAt = new Date().toISOString();
  backend.lastError = error;
  return backend;
}

export function toAiClientBackendRuntimeSnapshot(
  backend: AiClientBackendRuntime,
): BackendRuntimeSnapshot {
  return {
    id: backend.config.id,
    name: backend.config.name,
    baseUrl: backend.config.baseUrl,
    connector: getBackendConnector(backend.config),
    enabled: backend.config.enabled,
    healthy: backend.healthy,
    maxConcurrency: backend.config.maxConcurrency,
    activeRequests: backend.activeRequests,
    availableSlots: Math.max(0, backend.config.maxConcurrency - backend.activeRequests),
    totalRequests: backend.totalRequests,
    successfulRequests: backend.successfulRequests,
    failedRequests: backend.failedRequests,
    cancelledRequests: backend.cancelledRequests,
    lastLatencyMs: backend.lastLatencyMs,
    avgLatencyMs: backend.avgLatencyMs,
    lastCheckedAt: backend.lastCheckedAt,
    lastError: backend.lastError,
    configuredModels: backend.config.models ?? [],
    discoveredModels: backend.discoveredModels,
    discoveredModelDetails: backend.discoveredModelDetails,
  };
}

export function markAllAiClientBackendsDue(
  backends: AiClientBackendRuntime[],
  now = Date.now(),
): void {
  for (const backend of backends) {
    backend.nextHealthCheckAt = now;
  }
}

export function scheduleAiClientBackendHealthRefresh(
  backend: AiClientBackendRuntime,
  fallbackIntervalMs: number,
): void {
  backend.nextHealthCheckAt = Date.now() + getBackendMonitoringIntervalMs(backend.config, fallbackIntervalMs);
}
