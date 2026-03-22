import { defineEventHandler } from "h3";
import { cloneAiAgentPromptServiceDefinition } from "../../../../ai-agents-prompt-registry";

export default defineEventHandler((event) => {
  const services = event.context.aiAgents.getServices();

  return {
    services: services.map((service) => cloneAiAgentPromptServiceDefinition(service.definition)),
  };
});
