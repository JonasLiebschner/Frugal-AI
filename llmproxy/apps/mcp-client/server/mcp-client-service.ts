import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { H3Event } from "h3";

import { setEventContextValue } from "../../shared/server/event-context";
import { isRecord } from "../../shared/server/type-guards";
import type { McpClientConfigService } from "./mcp-client-config-types";
import type {
  ExternalMcpServerDefinition,
  ExternalMcpServerManifest,
  McpClientService,
  McpClientServiceOptions,
  ExternalMcpServerProvider,
  McpCompletionResult,
  McpPromptCompletionRequest,
  McpPromptDefinition,
  McpPromptPayload,
  McpResourceDefinition,
  McpResourceTemplateDefinition,
  McpToolCallResult,
  McpToolDefinition,
} from "./mcp-client-types";

const MCP_CLIENT_INFO = {
  name: "mcp-client",
  version: "1.0.0",
};
const MAX_PAGINATION_PAGES = 100;

interface McpClientConnection {
  server: ExternalMcpServerDefinition;
  client: Client;
  transport: StreamableHTTPClientTransport;
}

export function createMcpClientNitroCapability(
  client: McpClientService,
  configService: McpClientConfigService,
): McpClientService & { configService: McpClientConfigService } {
  return {
    ...client,
    configService,
  };
}

export function attachMcpClientEventContext(
  event: H3Event,
  capability: McpClientService & { configService: McpClientConfigService },
): void {
  setEventContextValue(event, "mcpClient", capability);
}

export function createMcpClientService(
  options: McpClientServiceOptions = {},
): McpClientService {
  const providers = new Set<ExternalMcpServerProvider>();
  const runtimeConfigServers = new Map<string, ExternalMcpServerDefinition>();
  const persistedServers = new Map<string, ExternalMcpServerDefinition>();
  const connections = new Map<string, Promise<McpClientConnection>>();
  const fetchImpl = (options.fetch ?? globalThis.fetch) as FetchLike;

  return {
    registerServer: (provider) => {
      const entries = Array.isArray(provider) ? provider : [provider];
      for (const entry of entries) {
        providers.add(entry);
      }
      return entries;
    },
    replaceRuntimeConfigServers: (servers) => {
      replaceServerSource(runtimeConfigServers, connections, servers);
    },
    replacePersistedServers: (servers) => {
      replaceServerSource(persistedServers, connections, servers);
    },
    listServers: () =>
      resolveServers(providers, runtimeConfigServers, persistedServers)
        .map(cloneExternalMcpServerDefinition),
    getServer: (serverId) => {
      const server = resolveServers(providers, runtimeConfigServers, persistedServers)
        .find((entry) => entry.id === serverId);
      return server ? cloneExternalMcpServerDefinition(server) : undefined;
    },
    getManifest: async (serverId) => {
      const connection = await ensureConnection(
        providers,
        runtimeConfigServers,
        persistedServers,
        connections,
        serverId,
        fetchImpl,
      );
      const capabilities = connection.client.getServerCapabilities() ?? {};
      const serverInfo = connection.client.getServerVersion();
      const instructions = connection.client.getInstructions();
      const normalizedServerInfo = isRecord(serverInfo)
        ? cloneStructured(serverInfo)
        : undefined;
      const tools = await listTools(connection.client, capabilities);
      const prompts = await listPrompts(connection.client, capabilities);
      const resources = await listResources(connection.client, capabilities);
      const resourceTemplates = await listResourceTemplates(
        connection.client,
        capabilities,
      );

      return {
        server: cloneExternalMcpServerDefinition(connection.server),
        protocolVersion: connection.transport.protocolVersion ?? "2025-11-25",
        capabilities: cloneStructured(capabilities),
        ...(normalizedServerInfo ? { serverInfo: normalizedServerInfo } : {}),
        ...(instructions ? { instructions } : {}),
        tools,
        prompts,
        resources,
        resourceTemplates,
      };
    },
    callTool: async (serverId, toolName, args) => {
      const connection = await ensureConnection(
        providers,
        runtimeConfigServers,
        persistedServers,
        connections,
        serverId,
        fetchImpl,
      );
      const toolArguments = isRecord(args) ? cloneStructured(args) : undefined;
      return cloneStructured(await connection.client.callTool({
        name: toolName,
        ...(toolArguments ? { arguments: toolArguments } : {}),
      })) as McpToolCallResult;
    },
    getPrompt: async (serverId, promptName, args) => {
      const connection = await ensureConnection(
        providers,
        runtimeConfigServers,
        persistedServers,
        connections,
        serverId,
        fetchImpl,
      );
      return cloneStructured(await connection.client.getPrompt({
        name: promptName,
        arguments: args,
      })) as McpPromptPayload;
    },
    completePrompt: async (serverId, promptName, request) => {
      const connection = await ensureConnection(
        providers,
        runtimeConfigServers,
        persistedServers,
        connections,
        serverId,
        fetchImpl,
      );
      return cloneStructured(await connection.client.complete({
        ref: {
          type: "ref/prompt",
          name: promptName,
        },
        argument: {
          name: request.argumentName,
          value: request.value,
        },
        context: {
          arguments: request.contextArguments,
        },
      })) as McpCompletionResult;
    },
    readResource: async (serverId, uri) => {
      const connection = await ensureConnection(
        providers,
        runtimeConfigServers,
        persistedServers,
        connections,
        serverId,
        fetchImpl,
      );
      const result = await connection.client.readResource({ uri });
      return {
        contents: cloneStructured(result.contents),
      };
    },
  };
}

async function ensureConnection(
  providers: ReadonlySet<ExternalMcpServerProvider>,
  runtimeConfigServers: ReadonlyMap<string, ExternalMcpServerDefinition>,
  persistedServers: ReadonlyMap<string, ExternalMcpServerDefinition>,
  connections: Map<string, Promise<McpClientConnection>>,
  serverId: string,
  fetchImpl: FetchLike,
): Promise<McpClientConnection> {
  const server = resolveServerById(providers, runtimeConfigServers, persistedServers, serverId);
  const existing = connections.get(server.id);
  if (existing) {
    return await existing;
  }

  const nextConnection = connectRemoteServer(server, fetchImpl);
  connections.set(server.id, nextConnection);

  try {
    return await nextConnection;
  } catch (error) {
    connections.delete(server.id);
    throw error;
  }
}

async function connectRemoteServer(
  server: ExternalMcpServerDefinition,
  fetchImpl: FetchLike,
): Promise<McpClientConnection> {
  const transport = new StreamableHTTPClientTransport(new URL(server.endpoint), {
    fetch: fetchImpl,
    ...(server.headers
      ? {
        requestInit: {
          headers: { ...server.headers },
        },
      }
      : {}),
  });
  const client = new Client(MCP_CLIENT_INFO, {
    capabilities: {},
  });

  try {
    await client.connect(transport);
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }

  return {
    server: cloneExternalMcpServerDefinition(server),
    client,
    transport,
  };
}

async function listTools(
  client: Client,
  capabilities: Record<string, unknown>,
): Promise<McpToolDefinition[]> {
  if (!isRecord(capabilities.tools)) {
    return [];
  }

  return await collectPages(
    async (cursor) => await client.listTools(cursor ? { cursor } : undefined),
    (result) => result.tools as McpToolDefinition[],
    (result) => result.nextCursor,
  );
}

async function listPrompts(
  client: Client,
  capabilities: Record<string, unknown>,
): Promise<McpPromptDefinition[]> {
  if (!isRecord(capabilities.prompts)) {
    return [];
  }

  return await collectPages(
    async (cursor) => await client.listPrompts(cursor ? { cursor } : undefined),
    (result) => result.prompts as McpPromptDefinition[],
    (result) => result.nextCursor,
  );
}

async function listResources(
  client: Client,
  capabilities: Record<string, unknown>,
): Promise<McpResourceDefinition[]> {
  if (!isRecord(capabilities.resources)) {
    return [];
  }

  return await collectPages(
    async (cursor) => await client.listResources(cursor ? { cursor } : undefined),
    (result) => result.resources as McpResourceDefinition[],
    (result) => result.nextCursor,
  );
}

async function listResourceTemplates(
  client: Client,
  capabilities: Record<string, unknown>,
): Promise<McpResourceTemplateDefinition[]> {
  if (!isRecord(capabilities.resources)) {
    return [];
  }

  return await collectPages(
    async (cursor) => await client.listResourceTemplates(cursor ? { cursor } : undefined),
    (result) => result.resourceTemplates as McpResourceTemplateDefinition[],
    (result) => result.nextCursor,
  );
}

async function collectPages<TPage, TItem>(
  fetchPage: (cursor?: string) => Promise<TPage>,
  getItems: (page: TPage) => TItem[],
  getNextCursor: (page: TPage) => string | undefined,
): Promise<TItem[]> {
  const items: TItem[] = [];
  let cursor: string | undefined;
  let pageCount = 0;

  do {
    const page = await fetchPage(cursor);
    items.push(...getItems(page).map(cloneStructured));
    cursor = normalizeCursor(getNextCursor(page));
    pageCount += 1;
  } while (cursor !== undefined && pageCount < MAX_PAGINATION_PAGES);

  return items;
}

function normalizeCursor(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const cursor = value.trim();
  return cursor.length > 0 ? cursor : undefined;
}

function resolveServerById(
  providers: ReadonlySet<ExternalMcpServerProvider>,
  runtimeConfigServers: ReadonlyMap<string, ExternalMcpServerDefinition>,
  persistedServers: ReadonlyMap<string, ExternalMcpServerDefinition>,
  serverId: string,
): ExternalMcpServerDefinition {
  const server = resolveServers(providers, runtimeConfigServers, persistedServers)
    .find((entry) => entry.id === serverId);
  if (!server) {
    throw new Error(`External MCP server "${serverId}" is not registered.`);
  }

  return server;
}

function resolveServers(
  providers: ReadonlySet<ExternalMcpServerProvider>,
  runtimeConfigServers: ReadonlyMap<string, ExternalMcpServerDefinition>,
  persistedServers: ReadonlyMap<string, ExternalMcpServerDefinition>,
): ExternalMcpServerDefinition[] {
  const servers = Array.from(providers).flatMap((provider) => {
    const result = provider();
    if (result === undefined) {
      return [];
    }

    return Array.isArray(result) ? result : [result];
  });

  return dedupeServers([
    ...servers,
    ...runtimeConfigServers.values(),
    ...persistedServers.values(),
  ]);
}

function dedupeServers(
  servers: readonly ExternalMcpServerDefinition[],
): ExternalMcpServerDefinition[] {
  const byId = new Map<string, ExternalMcpServerDefinition>();
  for (const server of servers) {
    byId.set(server.id, server);
  }
  return Array.from(byId.values());
}

function replaceServerSource(
  target: Map<string, ExternalMcpServerDefinition>,
  connections: Map<string, Promise<McpClientConnection>>,
  servers: readonly ExternalMcpServerDefinition[],
): void {
  const next = new Map(
    dedupeServers(servers).map((server) => [server.id, cloneExternalMcpServerDefinition(server)] as const),
  );

  for (const [serverId, current] of target) {
    const replacement = next.get(serverId);
    if (!replacement || !areServerDefinitionsEqual(current, replacement)) {
      invalidateConnection(connections, serverId);
    }
  }

  for (const serverId of next.keys()) {
    if (!target.has(serverId)) {
      invalidateConnection(connections, serverId);
    }
  }

  target.clear();
  for (const [serverId, server] of next) {
    target.set(serverId, server);
  }
}

function invalidateConnection(
  connections: Map<string, Promise<McpClientConnection>>,
  serverId: string,
): void {
  const connectionPromise = connections.get(serverId);
  if (!connectionPromise) {
    return;
  }

  connections.delete(serverId);
  void connectionPromise
    .then(async (connection) => {
      await connection.client.close().catch(() => undefined);
    })
    .catch(() => undefined);
}

function areServerDefinitionsEqual(
  left: ExternalMcpServerDefinition,
  right: ExternalMcpServerDefinition,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneExternalMcpServerDefinition(
  definition: ExternalMcpServerDefinition,
): ExternalMcpServerDefinition {
  return {
    id: definition.id,
    title: definition.title,
    endpoint: definition.endpoint,
    ...(definition.description ? { description: definition.description } : {}),
    ...(definition.transport ? { transport: definition.transport } : {}),
    ...(definition.protocolVersion ? { protocolVersion: definition.protocolVersion } : {}),
    ...(definition.headers ? { headers: { ...definition.headers } } : {}),
  };
}

function cloneStructured<TValue>(value: TValue): TValue {
  return structuredClone(value);
}
