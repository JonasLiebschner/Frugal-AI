import type { RequestFetch } from "../../../shared/server/request-fetch";
import {
  buildDiagnosticPromptFromContext,
  listDiagnosticPrompts,
  type DiagnosticPromptContextPayload,
} from "../ai-proxy-diagnostics";
import {
  buildAiProxyInternalRequestDiagnosticsPath,
  buildAiProxyInternalRequestListPath,
} from "../ai-proxy-capability";
import {
  clonePromptDefinition,
  type PromptProvider,
} from "../../../ai-agents/server/ai-agents-capability";
import { AI_PROXY_PROMPT_SERVICE_METADATA } from "./ai-proxy-prompt-service";

interface InternalDiagnosticsPayload {
  promptContext: DiagnosticPromptContextPayload;
}

interface InternalRequestListPayload {
  requests: Array<{
    id?: string;
  }>;
}

function asRequiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }

  return value.trim();
}

export const diagnosticPromptProvider: PromptProvider<RequestFetch> = () => {
  const prompts = listDiagnosticPrompts();

  return prompts.map((prompt) => ({
    service: AI_PROXY_PROMPT_SERVICE_METADATA,
    definition: clonePromptDefinition(prompt),
    get: async (args, requestFetch) => {
      const requestId = asRequiredString(args.request_id, 'prompts/get requires a string "request_id".');
      const payload = await requestFetch<InternalDiagnosticsPayload>(
        buildAiProxyInternalRequestDiagnosticsPath(requestId),
      );

      return buildDiagnosticPromptFromContext(prompt.name, payload.promptContext);
    },
    complete: async (request, requestFetch) => {
      if (request.argumentName !== "request_id") {
        return {
          values: [],
          total: 0,
          hasMore: false,
        };
      }

      const payload = await requestFetch<InternalRequestListPayload>(
        buildAiProxyInternalRequestListPath({
          limit: 50,
          includeLive: true,
          onlyWithDetail: true,
        }),
      );
      const needle = request.value.trim().toLowerCase();
      const requestIds = payload.requests
        .map((entry) => entry.id)
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
      const filtered = needle
        ? requestIds.filter((requestId) => requestId.toLowerCase().includes(needle))
        : requestIds;
      const values = filtered.slice(0, 100);

      return {
        values,
        total: filtered.length,
        hasMore: filtered.length > values.length,
      };
    },
  }));
};
