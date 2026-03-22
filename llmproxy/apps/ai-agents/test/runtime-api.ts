import type { RequestFetch } from "../../shared/server/request-fetch";
import type { TestLayerRuntime } from "../../shared/test/test-layer-runtime";
import {
  createRequestFetchBoundRouteBundleTestRuntime,
} from "../../shared/test/test-layer-runtime";
import type { AiAgentPromptRegistry } from "../server/ai-agents-capability";
import {
  createAiAgentPromptRegistry,
} from "../server/ai-agents-capability";
import { aiAgentsRouteBundle } from "./route-bundle";

export interface AiAgentsTestRuntime extends TestLayerRuntime {
  aiAgents: AiAgentPromptRegistry<RequestFetch>;
}

export function createAiAgentsTestRegistry(): AiAgentPromptRegistry<RequestFetch> {
  return createAiAgentPromptRegistry<RequestFetch>();
}

export function createAiAgentsTestRuntime(): AiAgentsTestRuntime {
  const aiAgents = createAiAgentsTestRegistry();
  return createRequestFetchBoundRouteBundleTestRuntime(
    "aiAgents",
    aiAgents,
    aiAgentsRouteBundle,
    { aiAgents },
  );
}
export { aiAgentsRouteBundle };
