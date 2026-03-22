import type { DashboardState, ServerEditorFields } from "../../types/dashboard";
import { createServerEditorFields } from "../../../llmproxy-client";
import { llmproxyAdminServerConfigPath } from "../../../llmproxy-admin-routes";
import { fetchJsonWithTimeout } from "../../../llmproxy-client";
import {
  closeServerEditorState,
  isAiClientSettingsSaveResponse,
  joinServerFieldLabels,
  parsePositiveIntegerField,
} from "./backend-control-helpers";
import {
  type BackendControlErrorToast,
  DASHBOARD_MUTATION_TIMEOUT_MS,
  type LoadConfigSchemas,
  type LoadConnectionConfigs,
} from "./backend-control-runtime";

export function createServerEditorControls(
  state: DashboardState,
  onErrorToast: BackendControlErrorToast,
  loadConfigSchemas: LoadConfigSchemas,
  loadConnectionConfigs: LoadConnectionConfigs,
) {
  async function openServerEditor(): Promise<void> {
    state.serverEditor.error = "";
    void loadConfigSchemas(["ai-client"]);

    if (!state.serverConfig) {
      state.serverEditor.loading = true;
      await loadConnectionConfigs();
      state.serverEditor.loading = false;
    }

    if (!state.serverConfig) {
      state.serverEditor.error = "AI client config could not be loaded from disk.";
      onErrorToast("Config", state.serverEditor.error);
      return;
    }

    state.serverEditor.open = true;
    state.serverEditor.fields = createServerEditorFields(state.serverConfig, state.configSchemas["ai-client"]);
  }

  function closeServerEditor(): void {
    closeServerEditorState(state);
  }

  async function saveServerEditor(fieldsOverride?: ServerEditorFields): Promise<void> {
    state.serverEditor.error = "";
    const fields = fieldsOverride ?? state.serverEditor.fields;

    try {
      const requestBody = {
        requestTimeoutMs: parsePositiveIntegerField(fields.requestTimeoutMs, "requestTimeoutMs"),
        queueTimeoutMs: parsePositiveIntegerField(fields.queueTimeoutMs, "queueTimeoutMs"),
        healthCheckIntervalMs: parsePositiveIntegerField(fields.healthCheckIntervalMs, "healthCheckIntervalMs"),
        recentRequestLimit: parsePositiveIntegerField(fields.recentRequestLimit, "recentRequestLimit"),
      };

      state.serverEditor.saving = true;

      const payload = await fetchJsonWithTimeout<unknown>(llmproxyAdminServerConfigPath, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        timeoutMs: DASHBOARD_MUTATION_TIMEOUT_MS,
        body: JSON.stringify(requestBody),
      });
      const persistedAiClientSettings = isAiClientSettingsSaveResponse(payload) && payload.settings ? payload.settings : null;
      const appliedImmediatelyFields = isAiClientSettingsSaveResponse(payload) && Array.isArray(payload.appliedImmediatelyFields)
        ? payload.appliedImmediatelyFields.filter((field): field is string => typeof field === "string" && field.length > 0)
        : [];

      await loadConnectionConfigs();
      if (persistedAiClientSettings) {
        state.serverConfig = persistedAiClientSettings;
        if (state.mcpEnabled === false) {
          state.debug.enableDiagnosticTools = false;
        }
      }

      state.serverEditor.appliedImmediatelyFields = appliedImmediatelyFields;

      if (appliedImmediatelyFields.length > 0) {
        state.serverEditor.notice = `Saved and applied immediately: ${joinServerFieldLabels(appliedImmediatelyFields)}.`;
        state.serverEditor.noticeTone = "good";
      } else {
        state.serverEditor.notice = "Saved. No config values changed.";
        state.serverEditor.noticeTone = "neutral";
      }

      closeServerEditorState(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.serverEditor.error = message;
      onErrorToast("Config", message);
    } finally {
      state.serverEditor.saving = false;
    }
  }

  return {
    openServerEditor,
    closeServerEditor,
    saveServerEditor,
  };
}
