import type { AiProxyToolServiceMetadata } from "./tool-provider-types";

export const AI_PROXY_TOOL_SERVICE_METADATA = {
  id: "ai-proxy",
  title: "AI proxy tools",
  description: "Built-in AI proxy tools available to protocol adapters, including request inspection, diagnosis, model listing, and OpenAI-compatible chat completions.",
} satisfies AiProxyToolServiceMetadata;
