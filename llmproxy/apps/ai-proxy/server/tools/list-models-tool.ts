import inputSchema from "./list-models-tool.input.json";
import outputSchema from "./list-models-tool.output.json";
import { AI_PROXY_TOOL_SERVICE_METADATA } from "./ai-proxy-tool-service";
import type { AiProxyToolProvider } from "./tool-provider-types";

export const listModelsToolProvider: AiProxyToolProvider = () => ({
  service: AI_PROXY_TOOL_SERVICE_METADATA,
  definition: {
    name: "list_models",
    title: "List models",
    description: "Returns the aggregated AI proxy model list in the OpenAI-compatible /v1/models shape.",
    inputSchema: inputSchema as Record<string, unknown>,
    outputSchema: outputSchema as Record<string, unknown>,
  },
  call: async (_args, requestFetch) => {
    const payload = await requestFetch<Record<string, unknown>>("/v1/models");
    return {
      content: [
        {
          type: "text",
          text: "Loaded the current AI proxy model list.",
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
