import type { ConfigService, ConfigUtils } from "../../config/server/config-capability";
import type {
  AiClientConfig,
  AiClientEditorConfig,
  AiClientSettings,
  ConnectionEditorConfig,
  ConnectionPatch,
  ConnectionSavePayload,
} from "../../shared/type-api";

export interface AiClientConfigService {
  readonly configPath: string;
  load: () => Promise<AiClientConfig>;
  updateConnection: (id: string, patch: ConnectionPatch) => Promise<AiClientConfig>;
  updateAiClientSettings: (settings: AiClientSettings) => Promise<AiClientConfig>;
  listEditableConnections: () => Promise<ConnectionEditorConfig[]>;
  loadEditableConfig: () => Promise<AiClientEditorConfig>;
  createConnection: (payload: ConnectionSavePayload) => Promise<{ config: AiClientConfig; connection: ConnectionEditorConfig }>;
  replaceConnection: (currentId: string, payload: ConnectionSavePayload) => Promise<{ config: AiClientConfig; connection: ConnectionEditorConfig }>;
  deleteConnection: (id: string) => Promise<AiClientConfig>;
}

export interface AiClientConfigServiceOptions {
  config?: ConfigService;
  utils?: ConfigUtils;
}
