import path from "node:path";

import type { TestLayerRuntime } from "../../shared/test/test-layer-runtime";
import type { SseCapability } from "../../sse/server/sse-capability";
import type { AiAgentsNitroCapability } from "../../ai-agents/server/ai-agents-capability";
import type { AiRequestMiddlewareNitroCapability } from "../../ai-request-middleware/server/ai-request-middleware-capability";
import type {
  AiClientConfigService,
  AiClientLoadBalancer,
} from "../../ai-client/server/ai-client-capability";
import type { ToolRegistryNitroCapability } from "../../tool-registry/server/tool-registry-capability";
import { createAiClientConfigService } from "../../ai-client/server/ai-client-capability";
import { createAiClientTestRuntimeDependencies } from "../../ai-client/test/runtime-api";
import { createConfigTestService, type ConfigTestServiceOptions } from "../../config/test/runtime-api";
import {
  createRouteBundleTestRuntime,
} from "../../shared/test/test-layer-runtime";
import {
  attachAiProxyEventContext,
} from "../server/ai-proxy-runtime";
import {
  buildHealthPayload,
  buildModelsPayload,
  handleProxyRoute,
  isSupportedProxyPath,
} from "../server/ai-proxy-routing";
import {
  AiProxyLiveRequestState,
  type LiveRequestState,
} from "../server/ai-proxy-live-requests";
import type { ActiveConnectionRuntime, AiProxyService } from "../server/ai-proxy-types";
import {
  aiProxyPromptProviders,
  aiProxyToolRegistryToolProviders,
} from "../server/ai-proxy-capability";
import { aiProxyRouteBundle } from "./route-bundle";

export interface AiProxyTestRuntimeOptions {
  configService: AiClientConfigService;
  loadBalancer: AiClientLoadBalancer;
  sse: SseCapability;
  aiRequestMiddleware?: Pick<AiRequestMiddlewareNitroCapability, "listConfiguredRoutingMiddlewares">;
  toolRegistry?: ToolRegistryNitroCapability;
  aiAgents?: AiAgentsNitroCapability;
}

export interface AiProxyTestRuntimeDependencies {
  config: ReturnType<typeof createConfigTestService>;
  configService: AiClientConfigService;
  mcpClientConfigPath: string;
  loadBalancer: AiClientLoadBalancer;
}

export type AiProxyTestLoadBalancer = AiClientLoadBalancer;

export interface AiProxyTestRuntime extends TestLayerRuntime {
  requestState: LiveRequestState;
}

export async function createAiProxyTestRuntimeDependencies(
  configPath: string,
): Promise<AiProxyTestRuntimeDependencies> {
  const mcpClientConfigPath = path.join(
    path.dirname(configPath),
    `${path.basename(configPath, path.extname(configPath))}.mcp-client.json`,
  );
  const config = createConfigTestService({
    configFilePaths: {
      "ai-client": configPath,
      "mcp-client": mcpClientConfigPath,
    },
  } satisfies ConfigTestServiceOptions);
  const configService = createAiClientConfigService({ config });
  const { loadBalancer } = await createAiClientTestRuntimeDependencies(configService);

  return {
    config,
    configService,
    mcpClientConfigPath,
    loadBalancer,
  };
}

export function createAiProxyTestRuntime(options: AiProxyTestRuntimeOptions): AiProxyTestRuntime {
  const requestState = new AiProxyLiveRequestState(options.loadBalancer, {
    sse: options.sse,
  });
  const aiProxyService: AiProxyService = {
    configService: options.configService,
    loadBalancer: options.loadBalancer,
    requestState,
    buildHealthPayload: () => buildHealthPayload(options.loadBalancer.getSnapshot()),
    buildModelsPayload: () => buildModelsPayload(
      options.loadBalancer.listKnownModels(),
      options.aiRequestMiddleware?.listConfiguredRoutingMiddlewares() ?? [],
    ),
    isSupportedPublicPath: (pathname) => isSupportedProxyPath(pathname),
    handlePublicRoute: async (event) => handleProxyRoute({
      loadBalancer: options.loadBalancer,
      requestState,
    }, event),
    stop: async () => {
      await requestState.stop();
    },
  };
  options.toolRegistry?.registerTool(aiProxyToolRegistryToolProviders);
  options.aiAgents?.registerPrompt(aiProxyPromptProviders);

  return createRouteBundleTestRuntime(
    { requestState },
    aiProxyRouteBundle,
    (event) => {
      attachAiProxyEventContext(event, aiProxyService);
    },
  );
}
