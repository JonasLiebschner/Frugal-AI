import type { ConfigService, ConfigUtils } from "../../config/server/config-capability";
import type {
  ExternalMcpServerEditorConfig,
  McpClientServerSavePayload,
} from "../../shared/type-api";
import type { ExternalMcpServerDefinition } from "./mcp-client-types";

export interface PersistedMcpClientConfig {
  servers: ExternalMcpServerDefinition[];
}

export interface McpClientConfigService {
  readonly configPath: string;
  load: () => Promise<PersistedMcpClientConfig>;
  listEditableServers: () => Promise<ExternalMcpServerEditorConfig[]>;
  createServer: (
    payload: McpClientServerSavePayload,
  ) => Promise<ExternalMcpServerEditorConfig>;
  replaceServer: (
    currentId: string,
    payload: McpClientServerSavePayload,
  ) => Promise<ExternalMcpServerEditorConfig>;
  deleteServer: (id: string) => Promise<void>;
}

export interface McpClientPersistedServerSync {
  replacePersistedServers: (servers: ExternalMcpServerDefinition[]) => void;
}

export interface McpClientConfigServiceOptions {
  config?: ConfigService;
  utils?: ConfigUtils;
  mcpClient?: McpClientPersistedServerSync;
}
