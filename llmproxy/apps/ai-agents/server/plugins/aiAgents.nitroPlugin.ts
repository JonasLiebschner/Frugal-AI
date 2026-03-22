import { createAiAgentPromptRegistry, type AiAgentPromptRegistry } from "../ai-agents-capability";
import { attachRequestFetchNitroContext, type RequestFetch } from "../../../shared/server/request-fetch";

export default defineNitroPlugin((nitroApp) => {
  const plugin = createAiAgentPromptRegistry<RequestFetch>();

  nitroApp.$aiAgents = plugin;
  attachRequestFetchNitroContext(nitroApp, "aiAgents", plugin);
});
