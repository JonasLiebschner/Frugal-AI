import type {
  EditableAiClientSettings,
  EditableAiRequestRoutingMiddleware,
  EditableConnectionConfig,
  EditableOtelConfig,
} from "../../types/dashboard";

export interface ConnectionListResponse {
  settings?: EditableAiClientSettings;
  data?: EditableConnectionConfig[];
  mcpEnabled?: boolean;
}

export interface AiClientSettingsSaveResponse {
  settings?: EditableAiClientSettings;
  appliedImmediatelyFields?: string[];
}

export interface OtelConfigResponse {
  config?: EditableOtelConfig;
}

export interface ConnectionSaveResponse {
  connection?: EditableConnectionConfig;
}

export interface AiRequestMiddlewareListResponse {
  data?: EditableAiRequestRoutingMiddleware[];
}
