import type { RequestFetch } from "../../../shared/server/request-fetch";
import type { PromptProvider } from "../../../ai-agents/server/ai-agents-capability";
import { diagnosticPromptProvider } from "./diagnostic-prompt-provider";

export const aiProxyPromptProviders: PromptProvider<RequestFetch>[] = [
  diagnosticPromptProvider,
];
