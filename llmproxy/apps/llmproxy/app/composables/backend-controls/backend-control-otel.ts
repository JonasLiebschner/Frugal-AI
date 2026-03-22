import type { DashboardState, OtelEditorFields } from "../../types/dashboard";
import { createOtelEditorFields } from "../../../llmproxy-client";
import { llmproxyAdminOtelPath } from "../../../llmproxy-admin-routes";
import { fetchJsonWithTimeout } from "../../../llmproxy-client";
import {
  closeOtelEditorState,
  isOtelConfigResponse,
  parseHeadersText,
  parsePositiveIntegerField,
} from "./backend-control-helpers";
import {
  type BackendControlErrorToast,
  DASHBOARD_MUTATION_TIMEOUT_MS,
  type LoadConfigSchemas,
  type LoadConnectionConfigs,
} from "./backend-control-runtime";

export function createOtelEditorControls(
  state: DashboardState,
  onErrorToast: BackendControlErrorToast,
  loadConfigSchemas: LoadConfigSchemas,
  loadConnectionConfigs: LoadConnectionConfigs,
) {
  async function openOtelEditor(): Promise<void> {
    state.otelEditor.error = "";
    void loadConfigSchemas(["otel"]);

    if (!state.otelConfig) {
      state.otelEditor.loading = true;
      await loadConnectionConfigs();
      state.otelEditor.loading = false;
    }

    if (!state.otelConfig) {
      state.otelEditor.error = "OpenTelemetry config could not be loaded from disk.";
      onErrorToast("OpenTelemetry", state.otelEditor.error);
      return;
    }

    state.otelEditor.open = true;
    state.otelEditor.fields = createOtelEditorFields(state.otelConfig, state.configSchemas["otel"]);
  }

  function closeOtelEditor(): void {
    closeOtelEditorState(state);
  }

  async function saveOtelEditor(fieldsOverride?: OtelEditorFields): Promise<void> {
    state.otelEditor.error = "";
    const fields = fieldsOverride ?? state.otelEditor.fields;

    try {
      const parsedHeaders = parseHeadersText(fields.headersText);
      const requestBody = {
        enabled: fields.enabled,
        endpoint: fields.endpoint.trim() || undefined,
        headers: parsedHeaders,
        clearHeaders: parsedHeaders ? false : fields.clearHeaders,
        timeoutMs: parsePositiveIntegerField(fields.timeoutMs, "timeoutMs"),
        serviceName: fields.serviceName.trim(),
        serviceNamespace: fields.serviceNamespace.trim() || undefined,
        deploymentEnvironment: fields.deploymentEnvironment.trim() || undefined,
        captureMessageContent: fields.captureMessageContent,
        captureToolContent: fields.captureToolContent,
      };

      state.otelEditor.saving = true;

      const payload = await fetchJsonWithTimeout<unknown>(llmproxyAdminOtelPath, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        timeoutMs: DASHBOARD_MUTATION_TIMEOUT_MS,
        body: JSON.stringify(requestBody),
      });
      const persistedOtelConfig = isOtelConfigResponse(payload) && payload.config ? payload.config : null;

      await loadConnectionConfigs();
      if (persistedOtelConfig) {
        state.otelConfig = persistedOtelConfig;
      }

      state.otelEditor.notice = "Saved and applied immediately: exporter settings, resource metadata, and content capture flags.";
      state.otelEditor.noticeTone = "good";
      closeOtelEditorState(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.otelEditor.error = message;
      onErrorToast("OpenTelemetry", message);
    } finally {
      state.otelEditor.saving = false;
    }
  }

  return {
    openOtelEditor,
    closeOtelEditor,
    saveOtelEditor,
  };
}
