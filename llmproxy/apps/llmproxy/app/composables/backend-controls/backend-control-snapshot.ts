import type {
  BackendSnapshot,
  DashboardState,
  EditableConnectionConfig,
  KnownModel,
  ProxySnapshot,
} from "../../types/dashboard";
import { isValidDebugModelSelection } from "../../../llmproxy-client";
import { collectSnapshotModels } from "../../utils/model-catalog";

export function ensureDebugModel(state: DashboardState): void {
  if (state.models.length === 0 && state.aiRequestMiddlewares.length === 0) {
    state.debug.model = "auto";
    return;
  }

  if (state.debug.model === "auto") {
    return;
  }

  if (!isValidDebugModelSelection(state.debug.model, state.models as KnownModel[], state.aiRequestMiddlewares)) {
    state.debug.model = "auto";
  }
}

export function syncModels(state: DashboardState, models: KnownModel[]): void {
  state.models = [...models].sort((left, right) => left.id.localeCompare(right.id));
  ensureDebugModel(state);
}

export function applyLocalSnapshot(state: DashboardState, snapshot: ProxySnapshot): void {
  state.snapshot = snapshot;
  syncModels(state, collectSnapshotModels(snapshot));
}

export function createSnapshotBackendFromConfig(
  config: EditableConnectionConfig,
  previous?: BackendSnapshot,
): BackendSnapshot {
  const activeRequests = previous?.activeRequests ?? 0;

  return {
    id: config.id,
    name: config.name,
    baseUrl: config.baseUrl,
    connector: config.connector,
    enabled: config.enabled,
    healthy: previous?.healthy ?? false,
    maxConcurrency: config.maxConcurrency,
    activeRequests,
    availableSlots: Math.max(0, config.maxConcurrency - activeRequests),
    totalRequests: previous?.totalRequests ?? 0,
    successfulRequests: previous?.successfulRequests ?? 0,
    failedRequests: previous?.failedRequests ?? 0,
    cancelledRequests: previous?.cancelledRequests ?? 0,
    lastLatencyMs: previous?.lastLatencyMs,
    avgLatencyMs: previous?.avgLatencyMs,
    lastCheckedAt: previous?.lastCheckedAt,
    lastError: previous?.lastError,
    configuredModels: config.models ? [...config.models] : [],
    discoveredModels: previous?.discoveredModels ? [...previous.discoveredModels] : [],
    discoveredModelDetails: previous?.discoveredModelDetails
      ? previous.discoveredModelDetails.map((detail) => ({
        id: detail.id,
        ...(detail.metadata !== undefined ? { metadata: detail.metadata } : {}),
      }))
      : [],
  };
}

export function upsertLocalConnectionConfig(
  state: DashboardState,
  config: EditableConnectionConfig,
  previousId?: string,
): void {
  if (previousId && previousId !== config.id) {
    delete state.backendConfigs[previousId];
  }

  state.backendConfigs[config.id] = config;
}

export function removeLocalConnectionConfig(state: DashboardState, backendId: string): void {
  delete state.backendConfigs[backendId];
}

export function upsertLocalSnapshotBackend(
  state: DashboardState,
  config: EditableConnectionConfig,
  previousId?: string,
): void {
  const targetId = previousId || config.id;
  const existingIndex = state.snapshot.backends.findIndex((backend) => backend.id === targetId);
  const previousBackend = existingIndex >= 0
    ? state.snapshot.backends[existingIndex]
    : state.snapshot.backends.find((backend) => backend.id === config.id);
  const nextBackend = createSnapshotBackendFromConfig(config, previousBackend);

  let nextBackends: BackendSnapshot[];
  if (existingIndex >= 0) {
    nextBackends = state.snapshot.backends.map((backend, index) => (
      index === existingIndex ? nextBackend : backend
    ));
  } else {
    nextBackends = [...state.snapshot.backends, nextBackend];
  }

  if (targetId !== config.id) {
    nextBackends = nextBackends.filter((backend, index) => (
      backend.id !== config.id || index === existingIndex
    ));
  }

  applyLocalSnapshot(state, {
    ...state.snapshot,
    backends: nextBackends,
  });
}

export function removeLocalSnapshotBackend(state: DashboardState, backendId: string): void {
  const nextBackends = state.snapshot.backends.filter((backend) => backend.id !== backendId);
  if (nextBackends.length === state.snapshot.backends.length) {
    return;
  }

  applyLocalSnapshot(state, {
    ...state.snapshot,
    backends: nextBackends,
  });
}
