import type { TestLayerRuntime } from "../../shared/test/test-layer-runtime";
import {
  createRouteBundleTestRuntime,
} from "../../shared/test/test-layer-runtime";
import {
  attachMcpClientEventContext,
  createMcpClientConfigService,
  createMcpClientNitroCapability,
  createMcpClientService,
} from "../server/mcp-client-capability";
import type {
  McpClientConfigService,
  McpClientServiceOptions,
  McpClientService,
} from "../server/mcp-client-capability";
import type { ConfigService } from "../../config/server/config-capability";
import { mcpClientTestRouteBundle } from "./route-bundle";

export interface McpClientTestRuntime extends TestLayerRuntime {
  mcpClient: McpClientService;
  mcpClientConfig: McpClientConfigService;
}

export interface McpClientTestRuntimeOptions extends McpClientServiceOptions {
  config?: ConfigService;
}

export function createMcpClientTestService(
  options: McpClientServiceOptions = {},
): McpClientService {
  return createMcpClientService(options);
}

export function createMcpClientTestRuntime(
  options: McpClientTestRuntimeOptions = {},
): McpClientTestRuntime {
  const mcpClient = createMcpClientTestService(options);
  const mcpClientConfig = createMcpClientConfigService({
    config: options.config,
    mcpClient,
  });
  return createRouteBundleTestRuntime(
    {
      mcpClient,
      mcpClientConfig,
    },
    mcpClientTestRouteBundle,
    (event) => {
      attachMcpClientEventContext(
        event,
        createMcpClientNitroCapability(mcpClient, mcpClientConfig),
      );
    },
  );
}
