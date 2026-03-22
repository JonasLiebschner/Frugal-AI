import type { PromptServiceMetadata } from "../../../ai-agents/server/ai-agents-capability";

export const AI_PROXY_PROMPT_SERVICE_METADATA = {
  id: "ai-proxy-diagnostics",
  title: "AI proxy diagnostics prompts",
  description: "Diagnostics and troubleshooting prompts derived from stored AI proxy request traces.",
} satisfies PromptServiceMetadata;
