import {
  resolveAiClientBackendRuntime,
  scheduleAiClientBackendHealthRefresh,
  type AiClientBackendRuntime,
} from "./ai-client-backend-runtime";
import { probeBackendHealth } from "./ai-client-health";

interface RefreshAiClientBackendHealthOptions {
  fetcher: typeof fetch;
  backends: AiClientBackendRuntime[];
  backendId: string;
  healthCheckIntervalMs: number;
  signal?: AbortSignal;
}

export function listDueAiClientBackendIds(
  backends: AiClientBackendRuntime[],
  now = Date.now(),
): string[] {
  return backends
    .filter((backend) => backend.nextHealthCheckAt <= now)
    .map((backend) => backend.config.id);
}

export function getNextAiClientBackendHealthDelay(
  backends: AiClientBackendRuntime[],
  now = Date.now(),
): number | undefined {
  const nextDueAt = backends.reduce<number | undefined>((soonest, backend) => {
    if (soonest === undefined) {
      return backend.nextHealthCheckAt;
    }

    return Math.min(soonest, backend.nextHealthCheckAt);
  }, undefined);

  if (nextDueAt === undefined) {
    return undefined;
  }

  return Math.max(0, nextDueAt - now);
}

export async function refreshAiClientBackendHealth(
  options: RefreshAiClientBackendHealthOptions,
): Promise<void> {
  const { fetcher, backends, backendId, healthCheckIntervalMs, signal } = options;
  const backend = backends.find((entry) => entry.config.id === backendId);

  if (!backend || signal?.aborted) {
    return;
  }

  const activeBackend = resolveAiClientBackendRuntime(backends, backendId, backend);
  const result = await probeBackendHealth(fetcher, activeBackend, signal);

  if (!result || signal?.aborted) {
    return;
  }

  const nextBackend = resolveAiClientBackendRuntime(backends, backendId, activeBackend);
  nextBackend.healthy = result.healthy;
  nextBackend.lastCheckedAt = result.lastCheckedAt;
  nextBackend.lastError = result.lastError;
  nextBackend.discoveredModelDetails = result.discoveredModelDetails;
  nextBackend.discoveredModels = result.discoveredModelDetails.map((entry) => entry.id);
  scheduleAiClientBackendHealthRefresh(nextBackend, healthCheckIntervalMs);
}
