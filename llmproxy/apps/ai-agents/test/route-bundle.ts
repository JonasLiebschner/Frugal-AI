import type { RouteBundle } from "../../shared/server/route-bundle";
import {
  aiAgentsInternalPromptCompletionRoutePattern,
  aiAgentsInternalPromptRoutePattern,
  aiAgentsInternalServicesPath,
} from "../server/ai-agents-capability";
import apiInternalServicesGet from "../server/api/ai-agents/internal/services/index.get";
import apiInternalPromptCompletionPost from "../server/api/ai-agents/internal/services/[serviceId]/prompts/[promptName]/completion.post";
import apiInternalPromptGetPost from "../server/api/ai-agents/internal/services/[serviceId]/prompts/[promptName]/index.post";

export const aiAgentsRouteBundle: RouteBundle = {
  get: [
    { path: aiAgentsInternalServicesPath, handler: apiInternalServicesGet },
  ],
  post: [
    { path: aiAgentsInternalPromptRoutePattern, handler: apiInternalPromptGetPost },
    { path: aiAgentsInternalPromptCompletionRoutePattern, handler: apiInternalPromptCompletionPost },
  ],
};
