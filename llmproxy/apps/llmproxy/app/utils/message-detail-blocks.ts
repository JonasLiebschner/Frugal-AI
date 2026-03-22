import { isClientRecord } from "./guards";
import { renderFunctionInvocationHtml } from "./message-compact-bubbles";
import { renderDetailBlock } from "./message-content";

export function renderMessageDetailBlocks(message: Record<string, any>): string {
  return (
    renderRefusalHtml(message) +
    renderFunctionCallHtml(message) +
    renderToolCallsHtml(message) +
    renderAudioHtml(message)
  );
}

function renderRefusalHtml(message: Record<string, any>): string {
  return typeof message?.refusal === "string" && message.refusal.length > 0
    ? renderDetailBlock("Refusal", message.refusal)
    : "";
}

function renderFunctionCallHtml(message: Record<string, any>): string {
  if (isClientRecord(message?.function_call)) {
    return renderFunctionInvocationHtml("Function Call", message.function_call, { note: "function_call payload" });
  }

  return message?.function_call ? renderDetailBlock("Function Call", message.function_call) : "";
}

function renderToolCallsHtml(message: Record<string, any>): string {
  if (!Array.isArray(message?.tool_calls) || message.tool_calls.length === 0) {
    return "";
  }

  return message.tool_calls.map((toolCall: unknown, toolIndex: number) => {
    if (isClientRecord(toolCall) && isClientRecord(toolCall.function)) {
      return renderFunctionInvocationHtml(`Tool Call ${toolIndex + 1}`, toolCall.function, {
        id: typeof toolCall.id === "string" ? toolCall.id : "",
        type: typeof toolCall.type === "string" ? toolCall.type : "",
      });
    }

    return renderDetailBlock(`Tool Call ${toolIndex + 1}`, toolCall);
  }).join("");
}

function renderAudioHtml(message: Record<string, any>): string {
  return typeof message?.audio === "object" && message.audio !== null
    ? renderDetailBlock("Audio", message.audio)
    : "";
}
