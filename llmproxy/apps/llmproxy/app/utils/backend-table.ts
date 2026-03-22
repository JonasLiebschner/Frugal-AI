import type {
  ActiveConnectionSnapshot,
  BackendSnapshot,
  RequestLogEntry,
} from "../types/dashboard";
import { formatDate } from "./formatters";
import { buildModelSpecs } from "./model-specs";

export function modelSpecs(backend: BackendSnapshot) {
  return buildModelSpecs(backend.configuredModels, backend.discoveredModels, backend.discoveredModelDetails);
}

export function backendStateClass(backend: BackendSnapshot): "good" | "bad" | "disabled" {
  if (!backend.enabled) {
    return "disabled";
  }

  return backend.healthy ? "good" : "bad";
}

export function backendStateTitle(backend: BackendSnapshot): string {
  const lastCheckText = backend.lastCheckedAt ? ` Last check: ${formatDate(backend.lastCheckedAt)}.` : "";

  if (!backend.enabled) {
    return `Backend is disabled and excluded from routing.${lastCheckText}`;
  }

  if (backend.healthy) {
    return `Backend is healthy and routable.${lastCheckText}`;
  }

  const lastError = backend.lastError === "Backend disabled." ? "" : (backend.lastError ?? "").trim();
  return lastError
    ? `Backend is currently unhealthy or unavailable for routing.${lastCheckText} Monitoring details: ${lastError}`
    : `Backend is currently unhealthy or unavailable for routing.${lastCheckText}`;
}

export function connectorLabel(connector: BackendSnapshot["connector"]): string {
  if (connector === "ollama") {
    return "Ollama";
  }

  if (connector === "llama.cpp") {
    return "llama.cpp";
  }

  return "OpenAI-compatible";
}

export function recentBackendRequests(
  backend: BackendSnapshot,
  recentRequests: RequestLogEntry[],
): RequestLogEntry[] {
  return recentRequests.filter((entry) => entry.backendId === backend.id);
}

export function recentBackendRequestCount(backend: BackendSnapshot, recentRequests: RequestLogEntry[]): number {
  return recentBackendRequests(backend, recentRequests).length;
}

export function recentBackendSuccessCount(backend: BackendSnapshot, recentRequests: RequestLogEntry[]): number {
  return recentBackendRequests(backend, recentRequests).filter((entry) => entry.outcome === "success").length;
}

export function recentBackendFailureCount(backend: BackendSnapshot, recentRequests: RequestLogEntry[]): number {
  return recentBackendRequests(backend, recentRequests).filter((entry) => entry.outcome === "error").length;
}

export function recentBackendCancelledCount(backend: BackendSnapshot, recentRequests: RequestLogEntry[]): number {
  return recentBackendRequests(backend, recentRequests).filter((entry) => entry.outcome === "cancelled").length;
}

export function recentBackendAverageLatency(backend: BackendSnapshot, recentRequests: RequestLogEntry[]): number | undefined {
  const entries = recentBackendRequests(backend, recentRequests);
  if (entries.length === 0) {
    return undefined;
  }

  const total = entries.reduce((sum, entry) => sum + entry.latencyMs, 0);
  return Math.round(total / entries.length);
}

export function recentBackendLastLatency(backend: BackendSnapshot, recentRequests: RequestLogEntry[]): number | undefined {
  return recentBackendRequests(backend, recentRequests)[0]?.latencyMs;
}

export function recentBackendAverageTokenRate(backend: BackendSnapshot, recentRequests: RequestLogEntry[]): number | undefined {
  const rates = recentBackendRequests(backend, recentRequests)
    .map((entry) => entry.completionTokensPerSecond)
    .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));

  if (rates.length === 0) {
    return undefined;
  }

  const total = rates.reduce((sum, value) => sum + value, 0);
  return total / rates.length;
}

export function recentBackendLastTokenRate(backend: BackendSnapshot, recentRequests: RequestLogEntry[]): number | undefined {
  return recentBackendRequests(backend, recentRequests).find((entry) => typeof entry.completionTokensPerSecond === "number")?.completionTokensPerSecond;
}

export function activeBackendConnections(
  backend: BackendSnapshot,
  activeConnections: ActiveConnectionSnapshot[],
): ActiveConnectionSnapshot[] {
  return activeConnections.filter((connection) => connection.backendId === backend.id);
}

export function currentBackendTokenRate(
  backend: BackendSnapshot,
  activeConnections: ActiveConnectionSnapshot[],
): number | undefined {
  const connections = activeBackendConnections(backend, activeConnections);
  if (connections.length === 0) {
    return 0;
  }

  const rates = connections
    .map((connection) => connection.completionTokensPerSecond)
    .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));

  if (rates.length === 0) {
    return undefined;
  }

  return rates.reduce((sum, value) => sum + value, 0);
}

export function recentWindowLabel(recentRequestLimit: number): string {
  return recentRequestLimit > 0
    ? `within the last ${recentRequestLimit} retained requests`
    : "within the current retained request window";
}
