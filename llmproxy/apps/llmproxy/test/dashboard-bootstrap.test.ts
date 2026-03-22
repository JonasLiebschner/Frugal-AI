import assert from "node:assert/strict";
import test from "node:test";

import type {
  BackendSnapshot,
  DashboardState,
  EditableConnectionConfig,
} from "../app/types/dashboard";
import {
  getConfigViewBackends,
  isDashboardReady,
} from "../llmproxy-client";

function createEmptyState(): Pick<
  DashboardState,
  "snapshot" | "serverConfig" | "backendConfigs" | "backendEditor"
> {
  return {
    snapshot: {
      startedAt: "",
      queueDepth: 0,
      recentRequestLimit: 1000,
      totals: {
        activeRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        cancelledRequests: 0,
        rejectedRequests: 0,
      },
      backends: [],
      activeConnections: [],
      recentRequests: [],
    },
    serverConfig: null,
    backendConfigs: {},
    backendEditor: {
      open: false,
      mode: "create",
      originalId: "",
      saving: false,
      deleting: false,
      loading: false,
      error: "",
      fields: {
        id: "",
        name: "",
        baseUrl: "",
        connector: "openai",
        enabled: true,
        maxConcurrency: "1",
        healthPath: "",
        modelsText: "",
        headersText: "",
        apiKey: "",
        apiKeyEnv: "",
        clearApiKey: false,
        timeoutMs: "",
        monitoringTimeoutMs: "",
        monitoringIntervalMs: "",
        energyUsageUrl: "",
      },
    },
  };
}

test("isDashboardReady stays false while neither snapshot nor config data is available", () => {
  assert.equal(isDashboardReady(createEmptyState()), false);
});

test("isDashboardReady becomes true once server config was loaded", () => {
  const state = createEmptyState();
  state.serverConfig = {
    requestTimeoutMs: 600_000,
    queueTimeoutMs: 30_000,
    healthCheckIntervalMs: 10_000,
    recentRequestLimit: 1000,
  };

  assert.equal(isDashboardReady(state), true);
});

test("getConfigViewBackends falls back to editable backend configs when runtime snapshot is still empty", () => {
  const backendConfigs: Record<string, EditableConnectionConfig> = {
    primary: {
      id: "primary",
      name: "Primary",
      baseUrl: "http://127.0.0.1:8080",
      connector: "openai",
      enabled: true,
      maxConcurrency: 2,
      models: ["*"],
      apiKeyConfigured: false,
    },
  };

  assert.deepEqual(getConfigViewBackends([], backendConfigs), [{
    id: "primary",
    name: "Primary",
    baseUrl: "http://127.0.0.1:8080",
    connector: "openai",
    enabled: true,
    healthy: false,
    maxConcurrency: 2,
    activeRequests: 0,
    availableSlots: 2,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    cancelledRequests: 0,
    lastError: "Runtime snapshot is not available yet.",
    configuredModels: ["*"],
    discoveredModels: [],
    discoveredModelDetails: [],
  } satisfies BackendSnapshot]);
});

test("getConfigViewBackends keeps runtime snapshot data when it is already available", () => {
  const runtimeBackends: BackendSnapshot[] = [{
    id: "primary",
    name: "Primary",
    baseUrl: "http://127.0.0.1:8080",
    connector: "openai",
    enabled: true,
    healthy: true,
    maxConcurrency: 2,
    activeRequests: 1,
    availableSlots: 1,
    totalRequests: 10,
    successfulRequests: 9,
    failedRequests: 1,
    cancelledRequests: 0,
    configuredModels: ["*"],
    discoveredModels: ["gpt-4.1"],
    discoveredModelDetails: [],
  }];

  assert.deepEqual(getConfigViewBackends(runtimeBackends, {}), runtimeBackends);
});
