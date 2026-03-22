import type { RenderMessageOptions } from "../types/dashboard";
import { isClientRecord } from "./guards";
import { hasStandaloneEmbeddedContent, hasVisibleMessageContent } from "./message-content";

export type MessageRenderState = {
  hasContent: boolean,
  reasoningLive: boolean,
  reasoningOnly: boolean,
  toolResponseOnly: boolean,
  toolCallOnly: boolean,
  singleToolCallOnly: boolean,
  pendingAssistantOnly: boolean,
  pendingToolOnly: boolean,
  assistantEmbeddedOnly: boolean,
  compactAssistantStackOnly: boolean,
};

export function getMessageRenderState(
  message: Record<string, any>,
  role: string,
  options: Pick<RenderMessageOptions, "finishReason"> = {},
): MessageRenderState {
  const hasContent = hasVisibleMessageContent(message?.content);
  const hasReasoning =
    typeof message?.reasoning_content === "string" &&
    message.reasoning_content.length > 0;
  const hasRefusal =
    typeof message?.refusal === "string" &&
    message.refusal.length > 0;
  const hasFunctionCall = isClientRecord(message?.function_call);
  const hasToolCalls = Array.isArray(message?.tool_calls) && message.tool_calls.length > 0;
  const hasAudio = typeof message?.audio === "object" && message.audio !== null;

  const reasoningLive =
    hasReasoning &&
    !(typeof options.finishReason === "string" && options.finishReason.length > 0);
  const reasoningOnly =
    hasReasoning &&
    !hasContent &&
    !hasRefusal &&
    !hasFunctionCall &&
    !hasToolCalls;
  const toolResponseOnly =
    role === "tool" &&
    hasContent &&
    !hasRefusal &&
    !hasFunctionCall &&
    !hasToolCalls &&
    !hasReasoning;
  const toolCallOnly =
    role === "assistant" &&
    hasToolCalls &&
    !hasContent &&
    !hasReasoning &&
    !hasRefusal &&
    !hasFunctionCall &&
    !hasAudio;
  const singleToolCallOnly = toolCallOnly && Array.isArray(message?.tool_calls) && message.tool_calls.length === 1;
  const pendingAssistantOnly =
    role === "assistant" &&
    message?.pending === true &&
    !hasContent &&
    !hasReasoning &&
    !hasRefusal &&
    !hasFunctionCall &&
    !hasToolCalls;
  const pendingToolOnly =
    role === "tool" &&
    message?.pending === true &&
    !hasContent &&
    !hasReasoning &&
    !hasRefusal &&
    !hasFunctionCall &&
    !hasToolCalls;
  const assistantEmbeddedOnly =
    role === "assistant" &&
    hasContent &&
    hasStandaloneEmbeddedContent(message?.content) &&
    !hasReasoning &&
    !hasRefusal &&
    !hasFunctionCall &&
    !hasToolCalls &&
    !hasAudio;
  const compactAssistantStackOnly =
    role === "assistant" &&
    !hasContent &&
    !hasRefusal &&
    !hasAudio &&
    (hasReasoning ||
      hasFunctionCall ||
      (Array.isArray(message?.tool_calls) && message.tool_calls.length > 1));

  return {
    hasContent,
    reasoningLive,
    reasoningOnly,
    toolResponseOnly,
    toolCallOnly,
    singleToolCallOnly,
    pendingAssistantOnly,
    pendingToolOnly,
    assistantEmbeddedOnly,
    compactAssistantStackOnly,
  };
}

export function buildMessageTurnClassName(role: string, state: MessageRenderState): string {
  let className = `turn ${role}`;

  if (state.reasoningOnly || state.toolResponseOnly || state.toolCallOnly || state.pendingToolOnly) {
    className += " compact-bubble-only";
  }

  if (state.reasoningOnly) {
    className += " reasoning-only";
  }

  if (state.toolResponseOnly || state.pendingToolOnly) {
    className += " tool-response-only";
  }

  if (state.toolCallOnly) {
    className += " tool-call-only";
  }

  if (state.singleToolCallOnly) {
    className += " single-tool-call-only";
  }

  if (state.assistantEmbeddedOnly) {
    className += " embedded-only";
  }

  if (state.compactAssistantStackOnly) {
    className += " compact-bubble-stack-only";
  }

  if (state.pendingAssistantOnly || state.pendingToolOnly) {
    className += " pending-only";
  }

  return className;
}
