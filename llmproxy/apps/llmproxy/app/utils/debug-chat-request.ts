import type {
  DashboardState,
  DebugTranscriptEntry,
} from "../types/dashboard";
import { fetchWithTimeout, readJsonResponse } from "../../llmproxy-client";
import {
  applyNonStreamingResponse,
  consumeStreamingResponse,
} from "./debug-chat-stream";
import { DEBUG_CHAT_RESPONSE_TIMEOUT_MS } from "./debug-chat-runtime";

export async function runSingleDebugAssistantRequest(
  state: Pick<DashboardState, "debug">,
  payload: Record<string, unknown>,
  assistantTurn: DebugTranscriptEntry,
  requestId: string,
  replaceTranscriptEntry: (entry: DebugTranscriptEntry) => DebugTranscriptEntry,
): Promise<DebugTranscriptEntry> {
  const response = await fetchWithTimeout("/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ai-proxy-request-id": requestId,
    },
    body: JSON.stringify(payload),
    timeoutMs: DEBUG_CHAT_RESPONSE_TIMEOUT_MS,
    signal: state.debug.abortController?.signal,
  });

  state.debug.backend = response.headers.get("x-ai-proxy-backend") || "";
  state.debug.lastRequestId = requestId;
  state.debug.status = `HTTP ${response.status}`;
  assistantTurn.backend = state.debug.backend;
  assistantTurn.model = response.headers.get("x-ai-proxy-model") || assistantTurn.model || "";

  if (payload.stream === true) {
    return await consumeStreamingResponse(response, state.debug, assistantTurn);
  }

  return applyNonStreamingResponse(
    state.debug,
    await readJsonResponse(response),
    assistantTurn,
    replaceTranscriptEntry,
  );
}
