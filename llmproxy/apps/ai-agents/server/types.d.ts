import type {
  AiAgentsNitroCapability,
  AiAgentPromptRouteContext,
} from "./ai-agents-capability";

declare module "h3" {
  interface H3EventContext {
    aiAgents: AiAgentPromptRouteContext;
  }
}

declare module "nitropack" {
  interface NitroApp {
    $aiAgents?: AiAgentsNitroCapability;
  }
}

export {};
