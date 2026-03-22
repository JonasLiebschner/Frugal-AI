import type { SseHandlerRegistrar } from "../../sse/server/sse-capability";

export const llmproxySseTopics = [
  {
    id: "ai-proxy:dashboard",
    title: "llmproxy dashboard",
    description: "Live dashboard snapshot stream for the llmproxy UI.",
  },
  {
    id: "ai-proxy:request-detail",
    title: "llmproxy request detail",
    description: "Live request detail stream namespace for the llmproxy UI.",
  },
] as const;

const llmproxySseTopicProvider = () => [...llmproxySseTopics];

export function registerLlmproxySseTopics(sse: SseHandlerRegistrar): void {
  sse.registerHandler(llmproxySseTopicProvider);
}
