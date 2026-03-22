import type { DebugTranscriptEntry } from "../types/dashboard";
import { callDiagnosticsTool } from "../../llmproxy-client";
import { prettyJson } from "./formatters";
import type { DebugToolCallRequest } from "./debug-chat-transcript";

export interface ExecuteDebugToolCallCallbacks {
  onStart?: (toolCall: DebugToolCallRequest) => DebugTranscriptEntry | void;
  onFinish?: (
    toolTurn: DebugTranscriptEntry,
    toolCall: DebugToolCallRequest,
    pendingTurn?: DebugTranscriptEntry | void,
  ) => void;
}

export async function executeDebugToolCalls(
  toolCalls: DebugToolCallRequest[],
  callbacks: ExecuteDebugToolCallCallbacks = {},
): Promise<DebugTranscriptEntry[]> {
  const responses: DebugTranscriptEntry[] = [];

  for (const toolCall of toolCalls) {
    const pendingTurn = callbacks.onStart?.(toolCall);
    let toolTurn: DebugTranscriptEntry;

    try {
      const result = await callDiagnosticsTool(toolCall.name, toolCall.args);
      toolTurn = {
        role: "tool",
        name: toolCall.name,
        tool_call_id: toolCall.id,
        content: prettyJson(result),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toolTurn = {
        role: "tool",
        name: toolCall.name,
        tool_call_id: toolCall.id,
        content: prettyJson({
          error: {
            message,
          },
        }),
      };
    }

    callbacks.onFinish?.(toolTurn, toolCall, pendingTurn);
    responses.push(toolTurn);
  }

  return responses;
}
