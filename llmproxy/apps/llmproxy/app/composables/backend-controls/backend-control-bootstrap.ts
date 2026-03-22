import type { DashboardState, ProxySnapshot } from "../../types/dashboard";
import { createConfigSchemaLoadCoordinator } from "../../../llmproxy-client";
import { fetchJsonWithTimeout } from "../../../llmproxy-client";
import { llmproxyAdminAiRequestMiddlewaresPath, llmproxyAdminConnectionsPath, llmproxyAdminOtelPath, llmproxyAdminStatePath } from "../../../llmproxy-admin-routes";
import {
  createDefaultBackendEditorFields,
  isDefaultBackendEditorFields,
} from "../../../llmproxy-client";
import {
  isAiRequestMiddlewareListResponse,
  isConnectionListResponse,
  isOtelConfigResponse,
  normalizeBackendRecord,
} from "./backend-control-helpers";
import {
  applyLocalSnapshot as applyDashboardLocalSnapshot,
  ensureDebugModel as ensureDashboardDebugModel,
} from "./backend-control-snapshot";
import {
  type ApplySnapshot,
  type BackendControlErrorToast,
  DASHBOARD_LOAD_TIMEOUT_MS,
} from "./backend-control-runtime";

export function createBackendControlBootstrap(
  state: DashboardState,
  onErrorToast: BackendControlErrorToast,
) {
  const loadConfigSchemas = createConfigSchemaLoadCoordinator(
    (packageName) => state.configSchemas[packageName],
    (schemas) => {
      for (const [packageName, schema] of Object.entries(schemas)) {
        if (schema) {
          state.configSchemas[packageName] = schema;

          if (
            packageName === "ai-client"
            && state.backendEditor.open
            && state.backendEditor.mode === "create"
            && isDefaultBackendEditorFields(state.backendEditor.fields)
          ) {
            state.backendEditor.fields = createDefaultBackendEditorFields(schema);
          }
        }
      }
    },
  );

  function applyLocalSnapshot(snapshot: ProxySnapshot): void {
    applyDashboardLocalSnapshot(state, snapshot);
  }

  async function refreshDashboardSnapshot(silent = false): Promise<void> {
    try {
      const snapshot = await fetchJsonWithTimeout<ProxySnapshot>(llmproxyAdminStatePath, {
        cache: "no-store",
        timeoutMs: DASHBOARD_LOAD_TIMEOUT_MS,
      });
      applyLocalSnapshot(snapshot);
    } catch (error) {
      if (silent) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      onErrorToast("Connections", `Saved, but the dashboard state could not be refreshed: ${message}`);
    }
  }

  async function loadConnectionConfigs(): Promise<void> {
    state.backendEditor.error = "";
    state.otelEditor.error = "";
    state.aiRequestMiddlewareEditor.error = "";
    state.backendEditor.loading = true;
    state.otelEditor.loading = true;
    state.aiRequestMiddlewareEditor.loading = true;

    try {
      void loadConfigSchemas(["ai-client", "otel", "ai-request-middleware"]);
      const [connectionsPayload, otelPayload, middlewarePayload] = await Promise.all([
        fetchJsonWithTimeout<unknown>(llmproxyAdminConnectionsPath, {
          cache: "no-store",
          timeoutMs: DASHBOARD_LOAD_TIMEOUT_MS,
        }),
        fetchJsonWithTimeout<unknown>(llmproxyAdminOtelPath, {
          cache: "no-store",
          timeoutMs: DASHBOARD_LOAD_TIMEOUT_MS,
        }),
        fetchJsonWithTimeout<unknown>(llmproxyAdminAiRequestMiddlewaresPath, {
          cache: "no-store",
          timeoutMs: DASHBOARD_LOAD_TIMEOUT_MS,
        }),
      ]);
      const connections = isConnectionListResponse(connectionsPayload) && Array.isArray(connectionsPayload.data)
        ? connectionsPayload.data
        : [];
      const middlewares = isAiRequestMiddlewareListResponse(middlewarePayload) && Array.isArray(middlewarePayload.data)
        ? middlewarePayload.data
        : [];
      state.serverConfig = isConnectionListResponse(connectionsPayload) && connectionsPayload.settings
        ? connectionsPayload.settings
        : null;
      state.otelConfig = isOtelConfigResponse(otelPayload) && otelPayload.config
        ? otelPayload.config
        : null;
      state.mcpEnabled = isConnectionListResponse(connectionsPayload) && typeof connectionsPayload.mcpEnabled === "boolean"
        ? connectionsPayload.mcpEnabled
        : null;
      state.backendConfigs = normalizeBackendRecord(connections);
      state.aiRequestMiddlewares = middlewares;
      if (state.mcpEnabled === false) {
        state.debug.enableDiagnosticTools = false;
      }
      ensureDebugModel();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.backendEditor.error = message;
      state.otelEditor.error = message;
      state.aiRequestMiddlewareEditor.error = message;
      onErrorToast("Config", message);
    } finally {
      state.backendEditor.loading = false;
      state.otelEditor.loading = false;
      state.aiRequestMiddlewareEditor.loading = false;
    }
  }

  function ensureDebugModel(): void {
    ensureDashboardDebugModel(state);
  }

  const applySnapshot: ApplySnapshot = (snapshot) => {
    applyLocalSnapshot(snapshot);
  };

  return {
    loadConfigSchemas,
    applySnapshot,
    ensureDebugModel,
    refreshDashboardSnapshot,
    loadConnectionConfigs,
  };
}
