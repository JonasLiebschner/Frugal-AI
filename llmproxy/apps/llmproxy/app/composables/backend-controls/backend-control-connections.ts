import type {
  BackendEditorFields,
  DashboardState,
} from "../../types/dashboard";
import { createDefaultBackendEditorFields } from "../../../llmproxy-client";
import {
  llmproxyAdminConnectionsPath,
  resolveLlmproxyAdminConnectionPath,
} from "../../../llmproxy-admin-routes";
import { fetchJsonWithTimeout, fetchWithTimeout, readErrorResponse } from "../../../llmproxy-client";
import {
  isConnectionSaveResponse,
  parseHeadersText,
  parseModelsText,
  parsePositiveIntegerField,
  resetBackendEditor,
  toBackendFields,
} from "./backend-control-helpers";
import {
  removeLocalConnectionConfig,
  removeLocalSnapshotBackend,
  upsertLocalConnectionConfig,
  upsertLocalSnapshotBackend,
} from "./backend-control-snapshot";
import {
  type BackendControlErrorToast,
  DASHBOARD_MUTATION_TIMEOUT_MS,
  type LoadConfigSchemas,
  type LoadConnectionConfigs,
  type RefreshDashboardSnapshot,
} from "./backend-control-runtime";

export function createConnectionControls(
  state: DashboardState,
  onErrorToast: BackendControlErrorToast,
  loadConfigSchemas: LoadConfigSchemas,
  loadConnectionConfigs: LoadConnectionConfigs,
  refreshDashboardSnapshot: RefreshDashboardSnapshot,
) {
  function openCreateBackend(): void {
    void loadConfigSchemas(["ai-client"]);
    state.backendEditor.open = true;
    state.backendEditor.mode = "create";
    state.backendEditor.originalId = "";
    state.backendEditor.saving = false;
    state.backendEditor.deleting = false;
    state.backendEditor.error = "";
    state.backendEditor.fields = createDefaultBackendEditorFields(state.configSchemas["ai-client"]);
  }

  async function openEditBackend(backendId: string): Promise<void> {
    state.backendEditor.error = "";

    if (!state.backendConfigs[backendId]) {
      await loadConnectionConfigs();
    }

    const config = state.backendConfigs[backendId];
    if (!config) {
      state.backendEditor.error = `Connection "${backendId}" could not be loaded from config.`;
      onErrorToast("Connections", state.backendEditor.error);
      return;
    }

    state.backendEditor.open = true;
    state.backendEditor.mode = "edit";
    state.backendEditor.originalId = backendId;
    state.backendEditor.saving = false;
    state.backendEditor.deleting = false;
    state.backendEditor.error = "";
    state.backendEditor.fields = toBackendFields(config);
  }

  function closeBackendEditor(): void {
    resetBackendEditor(state.backendEditor, state.configSchemas["ai-client"]);
  }

  async function saveBackendEditor(fieldsOverride?: BackendEditorFields): Promise<void> {
    const { mode, originalId } = state.backendEditor;
    const fields = fieldsOverride ?? state.backendEditor.fields;
    state.backendEditor.error = "";

    try {
      const requestBody = {
        id: fields.id.trim(),
        name: fields.name.trim(),
        baseUrl: fields.baseUrl.trim(),
        connector: fields.connector,
        enabled: fields.enabled,
        maxConcurrency: parsePositiveIntegerField(fields.maxConcurrency, "maxConcurrency"),
        healthPath: fields.healthPath.trim() || undefined,
        models: parseModelsText(fields.modelsText),
        headers: parseHeadersText(fields.headersText),
        apiKey: fields.apiKey.trim() || undefined,
        apiKeyEnv: fields.apiKeyEnv.trim() || undefined,
        clearApiKey: fields.clearApiKey,
        timeoutMs: parsePositiveIntegerField(fields.timeoutMs, "timeoutMs", true),
        monitoringTimeoutMs: parsePositiveIntegerField(fields.monitoringTimeoutMs, "monitoringTimeoutMs", true),
        monitoringIntervalMs: parsePositiveIntegerField(fields.monitoringIntervalMs, "monitoringIntervalMs", true),
        energyUsageUrl: fields.energyUsageUrl.trim() || undefined,
      };

      state.backendEditor.saving = true;

      const payload = await fetchJsonWithTimeout<unknown>(
        mode === "create"
          ? llmproxyAdminConnectionsPath
          : resolveLlmproxyAdminConnectionPath(originalId),
        {
          method: mode === "create" ? "POST" : "PUT",
          headers: {
            "content-type": "application/json",
          },
          timeoutMs: DASHBOARD_MUTATION_TIMEOUT_MS,
          body: JSON.stringify(requestBody),
        },
      );
      const persistedBackend = isConnectionSaveResponse(payload) ? payload.connection : undefined;
      if (persistedBackend) {
        upsertLocalConnectionConfig(state, persistedBackend, mode === "edit" ? originalId : undefined);
        upsertLocalSnapshotBackend(state, persistedBackend, mode === "edit" ? originalId : undefined);
      }

      closeBackendEditor();
      void refreshDashboardSnapshot(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.backendEditor.error = message;
      onErrorToast("Connections", message);
    } finally {
      state.backendEditor.saving = false;
    }
  }

  async function deleteBackendEditor(): Promise<void> {
    const { mode, originalId, fields } = state.backendEditor;
    state.backendEditor.error = "";

    if (mode !== "edit" || !originalId) {
      return;
    }

    await deleteBackendById(originalId, fields.name || originalId, true);
  }

  async function deleteBackendById(backendId: string, displayName?: string, fromEditor = false): Promise<void> {
    state.backendEditor.error = "";
    const backendLabel = displayName || state.backendConfigs[backendId]?.name || backendId;

    const confirmed = window.confirm(
      `Remove connection "${backendLabel}" from the persisted AI client config?\n\nThis takes effect immediately and new requests will no longer be routed to it.`,
    );

    if (!confirmed) {
      return;
    }

    if (fromEditor) {
      state.backendEditor.deleting = true;
    }

    try {
      const response = await fetchWithTimeout(resolveLlmproxyAdminConnectionPath(backendId), {
        method: "DELETE",
        timeoutMs: DASHBOARD_MUTATION_TIMEOUT_MS,
      });

      if (!response.ok) {
        throw new Error(await readErrorResponse(response));
      }

      removeLocalConnectionConfig(state, backendId);
      removeLocalSnapshotBackend(state, backendId);

      if (state.backendEditor.open && state.backendEditor.originalId === backendId) {
        closeBackendEditor();
      }

      void refreshDashboardSnapshot(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.backendEditor.error = message;
      onErrorToast("Connections", message);
    } finally {
      if (fromEditor) {
        state.backendEditor.deleting = false;
      }
    }
  }

  return {
    openCreateBackend,
    openEditBackend,
    closeBackendEditor,
    saveBackendEditor,
    deleteBackendEditor,
    deleteBackendById,
  };
}
