export {
  attachMcpClientEventContext,
  buildMcpClientInternalManifestPath,
  buildMcpClientInternalPromptCompletionPath,
  buildMcpClientInternalPromptPath,
  buildMcpClientInternalToolPath,
  createMcpClientConfigService,
  createMcpClientNitroCapability,
  createMcpClientService,
  mcpClientInternalManifestRoutePattern,
  mcpClientInternalPromptCompletionRoutePattern,
  mcpClientInternalPromptRoutePattern,
  mcpClientInternalServersPath,
  mcpClientInternalToolRoutePattern,
  normalizeConfiguredMcpServers,
} from "./mcp-client-runtime";

import type {
  McpClientConfigService,
  McpClientConfigServiceOptions,
  McpClientPersistedServerSync,
  PersistedMcpClientConfig,
} from "./mcp-client-config-types";
import type {
  McpClientService,
  McpClientServiceOptions,
} from "./mcp-client-types";

export type {
  McpClientConfigService,
  McpClientService,
  McpClientConfigServiceOptions,
  McpClientPersistedServerSync,
  McpClientServiceOptions,
  PersistedMcpClientConfig,
};

export interface McpClientNitroCapability {
  registerServer: McpClientService["registerServer"];
  replaceRuntimeConfigServers: McpClientService["replaceRuntimeConfigServers"];
  replacePersistedServers: McpClientService["replacePersistedServers"];
  listServers: McpClientService["listServers"];
  getServer: McpClientService["getServer"];
  getManifest: McpClientService["getManifest"];
  callTool: McpClientService["callTool"];
  getPrompt: McpClientService["getPrompt"];
  completePrompt: McpClientService["completePrompt"];
  readResource: McpClientService["readResource"];
  configService: McpClientConfigService;
}
