import type { TestLayerRuntime, TestLayerStack } from "../../shared/test/test-layer-runtime";
import type { SseHandlerRegistrar } from "../../sse/server/sse-capability";
import { createAjvTestRuntime } from "../../ajv/test/runtime-api";
import { createConfigTestRuntime } from "../../config/test/runtime-api";
import { createMcpClientTestRuntime, type McpClientTestRuntime } from "../../mcp-client/test/runtime-api";
import {
  createAiProxyTestRuntimeDependencies,
  createAiProxyTestRuntime,
  type AiProxyTestLoadBalancer,
  type AiProxyTestRuntimeDependencies,
  type AiProxyTestRuntime,
} from "../../ai-proxy/test/runtime-api";
import { createAiAgentsTestRuntime } from "../../ai-agents/test/runtime-api";
import { createSseTestRuntime, type SseTestRuntime } from "../../sse/test/runtime-api";
import { createMcpTestRuntime } from "../../mcp-server/test/runtime-api";
import { createToolRegistryTestRuntime } from "../../tool-registry/test/runtime-api";
import { createTestLayerStack } from "../../shared/test/test-layer-runtime";
import { registerLlmproxySseTopics } from "../server/llmproxy-sse";
import { createLlmproxyRouteBundleTestLayer } from "./route-bundle";
export {
  createAiProxyTestRuntimeDependencies as createLlmproxyTestRuntimeDependencies,
};
export type {
  AiProxyTestLoadBalancer as LlmproxyTestLoadBalancer,
  AiProxyTestRuntimeDependencies as LlmproxyTestRuntimeDependencies,
};

export { NitroTestServer } from "./nitro-test-server";

export interface LlmproxyTestRuntimeOptions {
  sse?: SseHandlerRegistrar;
}

export interface LlmproxyTestRuntime extends TestLayerRuntime {}

export interface LlmproxyTestLayerStackOptions {
  enableMcp?: boolean;
  maxSseClientBufferBytes?: number;
}

export type LlmproxyTestLayerStack = TestLayerStack<{
  ajv: ReturnType<typeof createAjvTestRuntime>;
  config: ReturnType<typeof createConfigTestRuntime>;
  mcpClient: McpClientTestRuntime;
  sse: SseTestRuntime;
  toolRegistry: ReturnType<typeof createToolRegistryTestRuntime>;
  aiAgents: ReturnType<typeof createAiAgentsTestRuntime>;
  mcp: ReturnType<typeof createMcpTestRuntime>;
  aiProxy: AiProxyTestRuntime;
  llmproxy: LlmproxyTestRuntime;
}>;

export function createLlmproxyTestRuntime(
  options: LlmproxyTestRuntimeOptions = {},
): LlmproxyTestRuntime {
  if (options.sse) {
    registerLlmproxySseTopics(options.sse);
  }

  return createLlmproxyRouteBundleTestLayer();
}

export function createLlmproxyTestLayerStack(
  dependencies: AiProxyTestRuntimeDependencies,
  options: LlmproxyTestLayerStackOptions = {},
): LlmproxyTestLayerStack {
  const ajv = createAjvTestRuntime();
  const config = createConfigTestRuntime({
    configFilePaths: {
      "ai-client": dependencies.configService.configPath,
      "mcp-client": dependencies.mcpClientConfigPath,
    },
  });
  const mcpClient = createMcpClientTestRuntime({
    config: config.config,
  });
  const sse = createSseTestRuntime({
    maxSseClientBufferBytes: options.maxSseClientBufferBytes,
  });
  const toolRegistry = createToolRegistryTestRuntime({
    validation: ajv.ajv,
  });
  const aiAgents = createAiAgentsTestRuntime();
  const mcp = createMcpTestRuntime({
    enabled: options.enableMcp,
  });
  const llmproxy = createLlmproxyTestRuntime({
    sse: sse.sse,
  });
  const aiProxy = createAiProxyTestRuntime({
    configService: dependencies.configService,
    loadBalancer: dependencies.loadBalancer,
    sse: sse.sse,
    toolRegistry: toolRegistry.toolRegistry,
    aiAgents: aiAgents.aiAgents,
  });

  return createTestLayerStack({
    ajv,
    config,
    mcpClient,
    sse,
    toolRegistry,
    aiAgents,
    mcp,
    aiProxy,
    llmproxy,
  });
}
