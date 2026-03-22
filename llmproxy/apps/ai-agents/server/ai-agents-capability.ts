export { createAiAgentPromptRegistry } from "./ai-agents-runtime";
export { clonePromptDefinition } from "./ai-agents-types";
export {
  aiAgentsInternalPromptCompletionRoutePattern,
  aiAgentsInternalPromptRoutePattern,
  aiAgentsInternalServicesPath,
  buildAiAgentsInternalPromptCompletionPath,
  buildAiAgentsInternalPromptPath,
} from "./ai-agents-internal-routes";

import type { RequestFetch } from "../../shared/server/request-fetch";
import type { AiAgentPromptRegistry } from "./ai-agents-types";

export type AiAgentsNitroCapability = AiAgentPromptRegistry<RequestFetch>;

export type {
  AiAgentHelperRouteDefinition,
  AiAgentPromptCompletionRequest,
  AiAgentPromptCompletionResult,
  AiAgentPromptDefinition,
  AiAgentPromptPayload,
  AiAgentPromptProvider,
  AiAgentPromptRegistration,
  AiAgentPromptRegistry,
  AiAgentPromptRouteContext,
  AiAgentPromptService,
  AiAgentPromptServiceDefinition,
  AiAgentServiceMetadata,
  PromptArgumentDefinition,
  PromptCompletionRequest,
  PromptCompletionResult,
  PromptDefinition,
  PromptHelperRouteDefinition,
  PromptMessage,
  PromptPayload,
  PromptProvider,
  PromptRegistration,
  PromptServiceMetadata,
} from "./ai-agents-types";
