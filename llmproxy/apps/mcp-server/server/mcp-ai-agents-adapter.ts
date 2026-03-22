import type { RequestFetch } from "../../shared/server/request-fetch";
import type { McpService } from "./mcp-server-types";
import { cloneMcpServiceDefinition } from "./mcp-server-types";
import {
  aiAgentsInternalServicesPath,
  buildAiAgentsInternalPromptCompletionPath,
  buildAiAgentsInternalPromptPath,
} from "../../ai-agents/server/ai-agents-capability";

interface InternalAiAgentsServicesPayload {
  services: Array<{
    id: string;
    title: string;
    description: string;
    helperRoutes: Array<{
      method: "GET" | "POST";
      path: string;
      title: string;
      description: string;
    }>;
    prompts: Array<{
      name: string;
      title: string;
      description: string;
      arguments: Array<{
        name: string;
        description: string;
        required: boolean;
      }>;
    }>;
  }>;
}

interface InternalAiAgentPromptPayload {
  description?: string;
  messages: Array<{
    role: "system" | "user";
    text: string;
  }>;
}

interface InternalAiAgentPromptCompletionPayload {
  values: string[];
  total?: number;
  hasMore?: boolean;
}

export async function fetchMcpAiAgentPromptServices(
  requestFetch: RequestFetch,
  fetchOptionalPayload: <T>(requestFetch: RequestFetch, path: string) => Promise<T | undefined>,
): Promise<McpService[]> {
  const payload = await fetchOptionalPayload<InternalAiAgentsServicesPayload>(
    requestFetch,
    aiAgentsInternalServicesPath,
  );
  if (!payload) {
    return [];
  }

  return payload.services.map((service) => ({
    definition: cloneMcpServiceDefinition({
      id: service.id,
      title: service.title,
      description: service.description,
      helperRoutes: service.helperRoutes,
      tools: [],
      prompts: service.prompts,
    }),
    getPrompt: async (promptName, args) => {
      const prompt = await requestFetch<InternalAiAgentPromptPayload>(
        buildAiAgentsInternalPromptPath(service.id, promptName),
        {
          method: "POST",
          body: {
            arguments: args,
          },
        },
      );

      return {
        description: prompt.description,
        messages: prompt.messages.map((message) => ({
          role: message.role,
          content: {
            type: "text",
            text: message.text,
          },
        })),
      };
    },
    completePrompt: async (promptName, request) => ({
      completion: await requestFetch<InternalAiAgentPromptCompletionPayload>(
        buildAiAgentsInternalPromptCompletionPath(service.id, promptName),
        {
          method: "POST",
          body: request,
        },
      ),
    }),
  }));
}
