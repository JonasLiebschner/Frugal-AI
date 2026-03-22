import type {
  BackendEditorFields,
  BackendEditorState,
  DashboardState,
  EditableConnectionConfig,
} from "../../types/dashboard";
import {
  createDefaultBackendEditorFields,
} from "../../../llmproxy-client";
import type {
  AiClientSettingsSaveResponse,
  AiRequestMiddlewareListResponse,
  ConnectionListResponse,
  ConnectionSaveResponse,
  OtelConfigResponse,
} from "./backend-control-types";

export function toBackendFields(config: EditableConnectionConfig): BackendEditorFields {
  return {
    id: config.id,
    name: config.name,
    baseUrl: config.baseUrl,
    connector: config.connector,
    enabled: config.enabled,
    maxConcurrency: String(config.maxConcurrency),
    healthPath: config.healthPath ?? "",
    modelsText: config.models?.join("\n") ?? "",
    headersText: config.headers && Object.keys(config.headers).length > 0
      ? JSON.stringify(config.headers, null, 2)
      : "",
    apiKey: "",
    apiKeyEnv: config.apiKeyEnv ?? "",
    clearApiKey: false,
    timeoutMs: config.timeoutMs ? String(config.timeoutMs) : "",
    monitoringTimeoutMs: config.monitoringTimeoutMs ? String(config.monitoringTimeoutMs) : "",
    monitoringIntervalMs: config.monitoringIntervalMs ? String(config.monitoringIntervalMs) : "",
    energyUsageUrl: config.energyUsageUrl ?? "",
  };
}

export function resetBackendEditor(
  editor: BackendEditorState,
  configSchema?: DashboardState["configSchemas"][string] | null,
): void {
  editor.open = false;
  editor.mode = "create";
  editor.originalId = "";
  editor.saving = false;
  editor.deleting = false;
  editor.loading = false;
  editor.error = "";
  editor.fields = createDefaultBackendEditorFields(configSchema);
}

export function closeServerEditorState(state: DashboardState): void {
  state.serverEditor.open = false;
  state.serverEditor.saving = false;
  state.serverEditor.loading = false;
  state.serverEditor.error = "";
}

export function closeOtelEditorState(state: DashboardState): void {
  state.otelEditor.open = false;
  state.otelEditor.saving = false;
  state.otelEditor.loading = false;
  state.otelEditor.error = "";
}

export function closeAiRequestMiddlewareEditorState(state: DashboardState): void {
  state.aiRequestMiddlewareEditor.open = false;
  state.aiRequestMiddlewareEditor.mode = "create";
  state.aiRequestMiddlewareEditor.originalId = "";
  state.aiRequestMiddlewareEditor.saving = false;
  state.aiRequestMiddlewareEditor.deleting = false;
  state.aiRequestMiddlewareEditor.loading = false;
  state.aiRequestMiddlewareEditor.error = "";
}

export function parseModelsText(modelsText: string): string[] | undefined {
  const models = modelsText
    .split(/[\r\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return models.length > 0 ? models : undefined;
}

export function parseHeadersText(headersText: string): Record<string, string> | undefined {
  if (!headersText.trim()) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(headersText);
  } catch {
    throw new Error("Headers must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Headers must be a JSON object of string values.");
  }

  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throw new Error(`Header "${key}" must have a string value.`);
    }

    const normalizedKey = key.trim();
    const normalizedValue = value.trim();
    if (!normalizedKey || !normalizedValue) {
      continue;
    }

    headers[normalizedKey] = normalizedValue;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function parsePositiveIntegerField(
  value: string | number | null | undefined,
  fieldName: string,
  allowEmpty = false,
): number | undefined {
  const trimmed = typeof value === "number"
    ? String(value)
    : (typeof value === "string" ? value.trim() : "");

  if (!trimmed) {
    if (allowEmpty) {
      return undefined;
    }

    throw new Error(`"${fieldName}" is required.`);
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`"${fieldName}" must be a positive integer.`);
  }

  return parsed;
}

export function normalizeBackendRecord(
  backends: EditableConnectionConfig[],
): Record<string, EditableConnectionConfig> {
  return Object.fromEntries(
    backends.map((backend) => [backend.id, backend]),
  );
}

export function isConnectionListResponse(value: unknown): value is ConnectionListResponse {
  return Boolean(value) && typeof value === "object";
}

export function isAiClientSettingsSaveResponse(value: unknown): value is AiClientSettingsSaveResponse {
  return Boolean(value) && typeof value === "object";
}

export function isConnectionSaveResponse(value: unknown): value is ConnectionSaveResponse {
  return Boolean(value) && typeof value === "object";
}

export function isOtelConfigResponse(value: unknown): value is OtelConfigResponse {
  return Boolean(value) && typeof value === "object";
}

export function isAiRequestMiddlewareListResponse(value: unknown): value is AiRequestMiddlewareListResponse {
  return Boolean(value) && typeof value === "object";
}

function formatServerFieldLabel(field: string): string {
  if (field === "requestTimeoutMs") {
    return "request timeout";
  }

  if (field === "queueTimeoutMs") {
    return "queue timeout";
  }

  if (field === "healthCheckIntervalMs") {
    return "health check interval";
  }

  if (field === "recentRequestLimit") {
    return "recent request limit";
  }

  return field;
}

export function joinServerFieldLabels(fields: string[]): string {
  return fields.map(formatServerFieldLabel).join(", ");
}
