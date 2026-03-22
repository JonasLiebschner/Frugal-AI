import inputSchema from "./chat-with-model-tool.input.json";
import outputSchema from "./chat-with-model-tool.output.json";
import { AI_PROXY_TOOL_SERVICE_METADATA } from "./ai-proxy-tool-service";
import type { AiProxyToolProvider } from "./tool-provider-types";

export const chatWithModelToolProvider: AiProxyToolProvider = () => ({
  service: AI_PROXY_TOOL_SERVICE_METADATA,
  definition: {
    name: "chat_with_model",
    title: "Chat with one model",
    description: "Send one OpenAI-compatible chat request to exactly one registered AI proxy model and receive one final non-streaming completion JSON payload. Use exactly one JSON object per tool call. Never concatenate multiple JSON objects, never send an array of request objects, and never combine several models into one payload. If you need multiple models, emit multiple separate chat_with_model tool calls as multiple tool_calls entries, one entry per model.",
    inputSchema: inputSchema as Record<string, unknown>,
    outputSchema: outputSchema as Record<string, unknown>,
  },
  call: async (args, requestFetch) => {
    const payload = await requestFetch<Record<string, unknown>>("/v1/chat/completions", {
      method: "POST",
      body: {
      ...args,
      stream: false,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: "Ran a non-streaming chat completion through the AI proxy and returned the final completion payload.",
        },
        {
          type: "json",
          json: payload,
        },
      ],
      structuredContent: payload,
    };
  },
});
