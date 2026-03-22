import type {
  BackendSnapshot,
  DashboardState,
  EditableConnectionConfig,
} from "./app/types/dashboard";

function createConfigModeBackendSnapshot(config: EditableConnectionConfig): BackendSnapshot {
  return {
    id: config.id,
    name: config.name,
    baseUrl: config.baseUrl,
    connector: config.connector,
    enabled: config.enabled,
    healthy: false,
    maxConcurrency: config.maxConcurrency,
    activeRequests: 0,
    availableSlots: config.maxConcurrency,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    cancelledRequests: 0,
    lastError: config.enabled ? "Runtime snapshot is not available yet." : "Backend disabled.",
    configuredModels: config.models ? [...config.models] : [],
    discoveredModels: [],
    discoveredModelDetails: [],
  };
}

export function isDashboardReady(
  state: Pick<DashboardState, "snapshot" | "serverConfig" | "backendConfigs" | "backendEditor">,
): boolean {
  return state.snapshot.startedAt.length > 0
    || state.serverConfig !== null
    || Object.keys(state.backendConfigs).length > 0
    || state.backendEditor.error.length > 0;
}

export function getConfigViewBackends(
  snapshotBackends: readonly BackendSnapshot[],
  backendConfigs: Readonly<Record<string, EditableConnectionConfig>>,
): BackendSnapshot[] {
  if (snapshotBackends.length > 0) {
    return [...snapshotBackends];
  }

  return Object.values(backendConfigs).map(createConfigModeBackendSnapshot);
}
