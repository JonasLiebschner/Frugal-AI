import type { RequestFetch } from "../../shared/server/request-fetch";
import { assignEventContext } from "../../shared/server/event-context";
import type { TestLayerRuntime } from "../../shared/test/test-layer-runtime";
import {
  createRequestFetchBoundRouteBundleTestRuntime,
} from "../../shared/test/test-layer-runtime";
import type {
  McpManifest,
  McpRouteService,
  McpServiceHandler,
  McpServiceRegistry,
} from "../server/mcp-server-capability";
import {
  createMcpHttpTransport,
  createMcpServerEventCapability,
  createMcpServiceRegistry,
} from "../server/mcp-server-capability";
import { mcpRouteBundle } from "./route-bundle";

export interface McpTestRuntimeOptions {
  enabled?: boolean;
  requestFetch?: RequestFetch;
}

export interface McpTestRuntime extends TestLayerRuntime {
  mcp: McpServiceRegistry;
}

export interface McpBoundTestRegistry extends McpRouteService<McpManifest> {
  registerHandler: (
    handler: McpServiceHandler | McpServiceHandler[],
  ) => McpServiceHandler[];
}

export function createMcpTestRegistry(
  options: McpTestRuntimeOptions = {},
): McpBoundTestRegistry {
  const registry = createMcpServiceRegistry({
    isEnabled: () => options.enabled !== false,
  });
  const routeService = registry.bindRequestFetch(
    options.requestFetch ?? createMissingTestRequestFetch(),
  );

  return {
    registerHandler: registry.registerHandler,
    getManifest: routeService.getManifest,
    handleRequest: routeService.handleRequest,
    isEnabled: routeService.isEnabled,
  };
}

export function createMcpTestRuntime(
  options: McpTestRuntimeOptions = {},
): McpTestRuntime {
  const mcp = createMcpServiceRegistry({
    isEnabled: () => options.enabled !== false,
  });
  const transport = createMcpHttpTransport({
    isEnabled: () => options.enabled !== false,
  });
  return createRequestFetchBoundRouteBundleTestRuntime(
    "mcp",
    mcp,
    mcpRouteBundle,
    { mcp },
    (event) => {
      assignEventContext(event, {
        mcpServer: createMcpServerEventCapability(
          mcp,
          transport,
          event.$fetch as RequestFetch,
        ),
      });
    },
  );
}

function createMissingTestRequestFetch(): RequestFetch {
  return async () => {
    throw new Error("MCP test registry requires a bound requestFetch for internal app lookups.");
  };
}

export { mcpRouteBundle };
