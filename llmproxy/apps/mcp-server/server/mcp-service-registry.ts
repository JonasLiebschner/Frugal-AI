import {
  type RequestFetch,
} from "../../shared/server/request-fetch";
import type {
  McpManifest,
  McpRouteService,
  McpService,
  McpServiceHandler,
  McpServiceRegistry,
  McpServiceRegistryOptions,
  McpToolDefinition,
  McpPromptDefinition,
} from "./mcp-server-types";
import { fetchOptionalInternalPayload } from "../../shared/server/optional-internal-fetch";
import { cloneHelperRoutes } from "../../shared/server/service-registry";
import { fetchMcpAiAgentPromptServices } from "./mcp-ai-agents-adapter";
import {
  buildMcpManifestFromServices,
  handleMcpRequestForServices,
} from "./mcp-protocol";
import { fetchMcpToolRegistryServices } from "./mcp-tool-registry-adapter";
import {
  cloneMcpPromptDefinition,
  cloneMcpServiceDefinition,
  cloneMcpToolDefinition,
} from "./mcp-server-types";

export function createMcpServiceRegistry(
  options: McpServiceRegistryOptions = {},
): McpServiceRegistry {
  const enabledResolver = options.isEnabled ?? (() => true);
  const handlers = new Set<McpServiceHandler>();
  const getManifestWithFetch = async (requestFetch: RequestFetch) => await buildMcpManifestFromServices(
    await getMcpServices(handlers, requestFetch),
  );
  const handleRequestWithFetch = async (payload: unknown, requestFetch: RequestFetch) => await handleMcpRequestForServices(
    payload,
    await getMcpServices(handlers, requestFetch),
  );

  const bindRequestFetch = (requestFetch: RequestFetch): McpRouteService<McpManifest> => ({
    getManifest: async () => await getManifestWithFetch(requestFetch),
    handleRequest: async (payload) => await handleRequestWithFetch(payload, requestFetch),
    isEnabled: registry.isEnabled,
  });

  const registry: McpServiceRegistry = {
    registerHandler: (handler) => registerHandlers(handlers, handler),
    bindRequestFetch,
    isEnabled: () => enabledResolver(),
  };

  return registry;
}

async function getMcpServices(
  handlers: ReadonlySet<McpServiceHandler>,
  requestFetch: RequestFetch,
): Promise<McpService[]> {
  const localServices = resolveHandlers(handlers);
  const [toolRegistryServices, promptServices] = await Promise.all([
    fetchMcpToolRegistryServices(requestFetch, fetchOptionalInternalPayload),
    fetchMcpAiAgentPromptServices(requestFetch, fetchOptionalInternalPayload),
  ]);
  const services = [...localServices, ...toolRegistryServices, ...promptServices];

  if (services.length === 0) {
    return [];
  }

  return mergeMcpServices(services);
}

function registerHandlers(
  handlerSet: Set<McpServiceHandler>,
  handler: McpServiceHandler | McpServiceHandler[],
): McpServiceHandler[] {
  const nextHandlers = Array.isArray(handler) ? handler : [handler];
  for (const entry of nextHandlers) {
    handlerSet.add(entry);
  }

  return nextHandlers;
}

function resolveHandlers(handlers: ReadonlySet<McpServiceHandler>): McpService[] {
  return Array.from(handlers).flatMap((handler) => {
    const result = handler();
    if (result === undefined) {
      return [];
    }

    return Array.isArray(result) ? result : [result];
  });
}

function mergeMcpServices(services: McpService[]): McpService[] {
  const merged = new Map<string, McpService>();

  for (const service of services) {
    const existing = merged.get(service.definition.id);
    if (!existing) {
      merged.set(service.definition.id, cloneMcpService(service));
      continue;
    }

    existing.definition.helperRoutes.push(...cloneHelperRoutes(service.definition.helperRoutes));
    existing.definition.tools.push(...service.definition.tools.map(cloneMcpToolDefinition));
    existing.definition.prompts.push(...service.definition.prompts.map(cloneMcpPromptDefinition));

    if (service.callTool) {
      existing.callTool = service.callTool;
    }

    if (service.getPrompt) {
      existing.getPrompt = service.getPrompt;
    }

    if (service.completePrompt) {
      existing.completePrompt = service.completePrompt;
    }
  }

  return Array.from(merged.values());
}

function cloneMcpService(service: McpService): McpService {
  return {
    definition: cloneMcpServiceDefinition(service.definition),
    callTool: service.callTool,
    getPrompt: service.getPrompt,
    completePrompt: service.completePrompt,
  };
}
