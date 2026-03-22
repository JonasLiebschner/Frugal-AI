import type { H3Event } from "h3";
import {
  createAppConfigStore,
} from "../../config/server/config-capability";
import { isRecord } from "../../shared/server/type-guards";
import type {
  ExternalMcpServerEditorConfig,
  McpClientServerSavePayload,
} from "../../shared/type-api";
import type { ExternalMcpServerDefinition } from "./mcp-client-types";
import { normalizeConfiguredMcpServers } from "./utils/runtime-config";
import type {
  McpClientConfigService,
  McpClientConfigServiceOptions,
  PersistedMcpClientConfig,
} from "./mcp-client-config-types";

export function createMcpClientConfigService(
  options: McpClientConfigServiceOptions = {},
): McpClientConfigService {
  const document = createAppConfigStore<unknown, PersistedMcpClientConfig>({
    packageName: "mcp-client",
    config: options.config,
    utils: options.utils,
    normalize: normalizeConfig,
    serialize: serializeConfig,
  });
  const { configPath } = document;

  return {
    configPath,
    load: async () => await document.load(),
    listEditableServers: async () => {
      const config = await document.load();
      return config.servers.map(toEditorConfig);
    },
    createServer: async (payload) => {
      const current = await document.load();
      const candidate = materializeServerDefinition(payload);
      current.servers.push(candidate);

      const next = normalizeConfig(current, configPath);
      document.save(next);
      options.mcpClient?.replacePersistedServers(next.servers);

      const created = next.servers.find((entry) => entry.id === candidate.id);
      if (!created) {
        throw new Error(`External MCP server "${candidate.id}" could not be created in ${configPath}.`);
      }

      return toEditorConfig(created);
    },
    replaceServer: async (currentId, payload) => {
      const current = await document.load();
      const serverIndex = current.servers.findIndex((entry) => entry.id === currentId);

      if (serverIndex < 0) {
        throw new Error(`External MCP server "${currentId}" was not found in ${configPath}.`);
      }

      const candidate = materializeServerDefinition(payload);
      current.servers.splice(serverIndex, 1, candidate);

      const next = normalizeConfig(current, configPath);
      document.save(next);
      options.mcpClient?.replacePersistedServers(next.servers);

      const updated = next.servers.find((entry) => entry.id === candidate.id);
      if (!updated) {
        throw new Error(`External MCP server "${candidate.id}" could not be updated in ${configPath}.`);
      }

      return toEditorConfig(updated);
    },
    deleteServer: async (id) => {
      const current = await document.load();
      const serverIndex = current.servers.findIndex((entry) => entry.id === id);

      if (serverIndex < 0) {
        throw new Error(`External MCP server "${id}" was not found in ${configPath}.`);
      }

      current.servers.splice(serverIndex, 1);

      const next = normalizeConfig(current, configPath);
      document.save(next);
      options.mcpClient?.replacePersistedServers(next.servers);
    },
  };
}

function normalizeConfig(
  input: unknown,
  configPath: string,
): PersistedMcpClientConfig {
  if (input === undefined) {
    return { servers: [] };
  }

  if (!isRecord(input)) {
    throw new Error(`Invalid MCP client config in ${configPath}.`);
  }

  return {
    servers: normalizeConfiguredMcpServers(input.servers, configPath),
  };
}

function serializeConfig(
  config: PersistedMcpClientConfig,
): Record<string, unknown> {
  return {
    servers: config.servers.map((server) => ({
      id: server.id,
      title: server.title,
      endpoint: server.endpoint,
      ...(server.description ? { description: server.description } : {}),
      ...(server.transport ? { transport: server.transport } : {}),
      ...(server.protocolVersion ? { protocolVersion: server.protocolVersion } : {}),
      ...(server.headers && Object.keys(server.headers).length > 0
        ? { headers: { ...server.headers } }
        : {}),
    })),
  };
}

function materializeServerDefinition(
  payload: McpClientServerSavePayload,
): ExternalMcpServerDefinition {
  return normalizeConfiguredMcpServers([payload], "mcp-client save payload")[0];
}

function toEditorConfig(
  server: ExternalMcpServerDefinition,
): ExternalMcpServerEditorConfig {
  return {
    id: server.id,
    title: server.title,
    endpoint: server.endpoint,
    description: server.description,
    transport: server.transport,
    protocolVersion: server.protocolVersion,
    headers: server.headers ? { ...server.headers } : undefined,
  };
}
