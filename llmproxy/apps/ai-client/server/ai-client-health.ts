import { joinUrl } from "../../shared/server/network-utils";
import { toErrorMessage } from "../../shared/server/core-utils";
import { AiClientConfig, DiscoveredModelDetail } from "../../shared/type-api";
import { getDefaultHealthPaths } from "./ai-client-backend-connectors";
import { tryExtractDiscoveredModels } from "./ai-client-model-selection";

const DEFAULT_BACKEND_MONITORING_TIMEOUT_MS = 5_000;
const DEFAULT_BACKEND_MONITORING_INTERVAL_MS = 10_000;

export interface AiClientHealthBackendRuntime {
  config: AiClientConfig["connections"][number];
  resolvedHeaders: Record<string, string>;
  discoveredModelDetails: DiscoveredModelDetail[];
}

export interface AiClientHealthProbeResult {
  healthy: boolean;
  lastCheckedAt: string;
  lastError?: string;
  discoveredModelDetails: DiscoveredModelDetail[];
}

export async function probeBackendHealth(
  fetcher: typeof fetch,
  backend: AiClientHealthBackendRuntime,
  signal?: AbortSignal,
): Promise<AiClientHealthProbeResult | undefined> {
  if (signal?.aborted) {
    return undefined;
  }

  if (!backend.config.enabled) {
    return {
      healthy: false,
      lastCheckedAt: new Date().toISOString(),
      lastError: "Backend disabled.",
      discoveredModelDetails: backend.discoveredModelDetails,
    };
  }

  const healthPaths = getDefaultHealthPaths(backend.config);
  let lastError = "Health check failed.";
  let discoveredModelDetails = backend.discoveredModelDetails;

  for (const healthPath of healthPaths) {
    if (signal?.aborted) {
      return undefined;
    }

    try {
      const response = await fetchWithTimeout(
        fetcher,
        joinUrl(backend.config.baseUrl, healthPath),
        {
          method: "GET",
          headers: backend.resolvedHeaders,
        },
        getBackendMonitoringTimeoutMs(backend.config),
        signal,
      );

      if (signal?.aborted) {
        return undefined;
      }

      if (!response.ok) {
        lastError = `${healthPath} returned HTTP ${response.status}.`;
        continue;
      }

      discoveredModelDetails = await tryExtractDiscoveredModels(response, discoveredModelDetails);

      return {
        healthy: true,
        lastCheckedAt: new Date().toISOString(),
        discoveredModelDetails,
      };
    } catch (error) {
      if (signal?.aborted) {
        return undefined;
      }

      lastError = toErrorMessage(error);
    }
  }

  if (signal?.aborted) {
    return undefined;
  }

  return {
    healthy: false,
    lastCheckedAt: new Date().toISOString(),
    lastError,
    discoveredModelDetails,
  };
}

export function getBackendMonitoringIntervalMs(
  backend: Pick<AiClientConfig["connections"][number], "monitoringIntervalMs">,
  fallbackIntervalMs: number,
): number {
  return backend.monitoringIntervalMs ?? fallbackIntervalMs ?? DEFAULT_BACKEND_MONITORING_INTERVAL_MS;
}

function getBackendMonitoringTimeoutMs(
  backend: Pick<AiClientConfig["connections"][number], "monitoringTimeoutMs">,
): number {
  return backend.monitoringTimeoutMs ?? DEFAULT_BACKEND_MONITORING_TIMEOUT_MS;
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const abort = (reason?: unknown) => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };
  const timeout = setTimeout(() => {
    abort(new Error(`Timed out after ${timeoutMs}ms.`));
  }, timeoutMs);
  const onAbort = () => {
    abort(signal?.reason ?? new Error("Request was aborted."));
  };

  try {
    if (signal?.aborted) {
      onAbort();
    } else {
      signal?.addEventListener("abort", onAbort, { once: true });
    }

    return await fetcher(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}
