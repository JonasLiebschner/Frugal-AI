import type { RequestFetch } from "../../shared/server/request-fetch";
import type {
  McpHandlerRegistrar,
  McpHttpTransport,
  McpRouteService,
  McpServiceHandler,
  McpServiceRegistry,
} from "./mcp-server-types";
import { createMcpHttpTransport } from "./mcp-http-transport";
import { createMcpServiceRegistry } from "./mcp-service-registry";

export { createMcpHttpTransport, createMcpServiceRegistry };

export interface McpServerNitroCapability extends McpHandlerRegistrar<McpServiceHandler> {
  transport: McpHttpTransport;
}

export interface McpServerEventCapability extends McpRouteService {
  transport: McpHttpTransport;
}

export function createMcpServerNitroCapability(
  registry: McpServiceRegistry,
  transport: McpHttpTransport,
): McpServerNitroCapability {
  return {
    registerHandler: registry.registerHandler,
    transport,
  };
}

export function createMcpServerEventCapability(
  registry: McpServiceRegistry,
  transport: McpHttpTransport,
  requestFetch: RequestFetch,
): McpServerEventCapability {
  return {
    ...registry.bindRequestFetch(requestFetch),
    transport,
  };
}
