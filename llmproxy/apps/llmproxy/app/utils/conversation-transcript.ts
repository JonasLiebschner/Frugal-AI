import type {
  ConversationTranscriptItem,
  DebugTranscriptEntry,
  RequestLogDetail,
} from "../types/dashboard";
import { readReasoningText } from "./debug-chat-metrics";
import { isClientRecord } from "./guards";

function cloneTranscriptToolCall(value: unknown): unknown {
  if (!isClientRecord(value)) {
    return value;
  }

  return {
    ...value,
    ...(isClientRecord(value.function) ? { function: { ...value.function } } : {}),
  };
}

function readNonEmptyString(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "";
}

function buildConversationMessageRecord(
  value: unknown,
  options: {
    model?: string;
    backend?: string;
    finishReason?: string;
    inferredToolName?: string;
    allowPending?: boolean;
  } = {},
): Record<string, unknown> {
  if (!isClientRecord(value)) {
    return {
      role: "unknown",
      content: value ?? null,
      reasoning_content: "",
      refusal: "",
    };
  }

  const toolCallId = readNonEmptyString(value.tool_call_id);
  const inferredToolName = toolCallId ? readNonEmptyString(options.inferredToolName) : "";
  const name = readNonEmptyString(value.name) || inferredToolName;
  const model = readNonEmptyString(value.model) || readNonEmptyString(options.model);
  const backend = readNonEmptyString(value.backend) || readNonEmptyString(options.backend);
  const finishReason = readNonEmptyString(value.finish_reason) || readNonEmptyString(options.finishReason);

  return {
    role: readNonEmptyString(value.role) || "unknown",
    content: Object.prototype.hasOwnProperty.call(value, "content") ? (value.content ?? null) : null,
    reasoning_content: readReasoningText(value),
    refusal: typeof value.refusal === "string" ? value.refusal : "",
    ...(name ? { name } : {}),
    ...(toolCallId ? { tool_call_id: toolCallId } : {}),
    ...(model ? { model } : {}),
    ...(backend ? { backend } : {}),
    ...(finishReason ? { finish_reason: finishReason } : {}),
    ...(options.allowPending && value.pending === true ? { pending: true } : {}),
    ...(options.allowPending && typeof value.pending_title === "string" && value.pending_title.length > 0
      ? { pending_title: value.pending_title }
      : {}),
    ...(isClientRecord(value.function_call) ? { function_call: { ...value.function_call } } : {}),
    ...(Array.isArray(value.tool_calls)
      ? { tool_calls: value.tool_calls.map((toolCall) => cloneTranscriptToolCall(toolCall)) }
      : {}),
    ...(isClientRecord(value.audio) ? { audio: { ...value.audio } } : {}),
  };
}

function rememberToolCallNames(message: Record<string, unknown>, toolNamesByCallId: Map<string, string>): void {
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  for (const toolCall of toolCalls) {
    if (!isClientRecord(toolCall) || !isClientRecord(toolCall.function)) {
      continue;
    }

    const toolCallId = readNonEmptyString(toolCall.id);
    const toolName = readNonEmptyString(toolCall.function.name);
    if (!toolCallId || !toolName) {
      continue;
    }

    toolNamesByCallId.set(toolCallId, toolName);
  }
}

export function buildConversationMessageFromDebugEntry(
  entry: DebugTranscriptEntry,
): Record<string, unknown> {
  return buildConversationMessageRecord(entry, { allowPending: true });
}

export function buildConversationItemsFromDebugTranscript(
  transcript: DebugTranscriptEntry[],
  options: {
    startIndex?: number;
    hideFinishBadge?: boolean;
    reasoningCollapsed?: boolean;
    keyPrefix?: string;
  } = {},
): ConversationTranscriptItem[] {
  const startIndex = options.startIndex ?? 0;
  const keyPrefix = options.keyPrefix ?? "transcript";

  return transcript.map((entry, index) => ({
    key: `${keyPrefix}:${index}:${entry.role}`,
    message: buildConversationMessageFromDebugEntry(entry),
    index: startIndex + index,
    finishReason: entry.finish_reason || "",
    hideFinishBadge: options.hideFinishBadge ?? true,
    reasoningCollapsed: options.reasoningCollapsed ?? true,
  }));
}

export function buildRequestConversationItems(
  detail: RequestLogDetail | null | undefined,
  options: {
    startIndex?: number;
    includeRequestMessages?: boolean;
    hideFinishBadge?: boolean;
    reasoningCollapsed?: boolean;
    requestKeyPrefix?: string;
    responseKeyPrefix?: string;
  } = {},
): ConversationTranscriptItem[] {
  if (!detail) {
    return [];
  }

  const startIndex = options.startIndex ?? 0;
  const includeRequestMessages = options.includeRequestMessages ?? true;
  const hideFinishBadge = options.hideFinishBadge ?? true;
  const reasoningCollapsed = options.reasoningCollapsed ?? true;
  const requestKeyPrefix = options.requestKeyPrefix ?? "request";
  const responseKeyPrefix = options.responseKeyPrefix ?? "response";

  const requestBody = isClientRecord(detail.requestBody)
    ? detail.requestBody as Record<string, unknown>
    : null;
  const requestMessages = Array.isArray(requestBody?.messages) ? requestBody.messages : [];
  const toolNamesByCallId = new Map<string, string>();

  const requestItems: ConversationTranscriptItem[] = [];
  if (includeRequestMessages) {
    for (let index = 0; index < requestMessages.length; index += 1) {
      const rawMessage = requestMessages[index];
      const inferredToolName =
        isClientRecord(rawMessage) && typeof rawMessage.tool_call_id === "string" && rawMessage.tool_call_id.length > 0
          ? toolNamesByCallId.get(rawMessage.tool_call_id)
          : undefined;
      const message = buildConversationMessageRecord(rawMessage, { inferredToolName });
      requestItems.push({
        key: `${requestKeyPrefix}:${index}:${typeof message.role === "string" ? message.role : "unknown"}`,
        message,
        index: startIndex + index,
        hideFinishBadge,
        reasoningCollapsed,
      });
      rememberToolCallNames(message, toolNamesByCallId);
    }
  }

  const responseBody = isClientRecord(detail.responseBody)
    ? detail.responseBody as Record<string, unknown>
    : null;
  const choices = Array.isArray(responseBody?.choices) ? responseBody.choices : null;
  if (!responseBody || !choices || choices.length === 0) {
    return requestItems;
  }

  const resolvedModel =
    typeof responseBody.model === "string" && responseBody.model.trim().length > 0
      ? responseBody.model.trim()
      : (detail.entry.model ?? "");

  const responseStartIndex = startIndex + requestItems.length;
  const responseItems = choices.flatMap((choice: unknown, choiceIndex: number): ConversationTranscriptItem[] => {
    if (isClientRecord(choice) && isClientRecord(choice.message)) {
      const message = buildConversationMessageRecord(choice.message, {
        model: resolvedModel,
        finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : "",
      });
      rememberToolCallNames(message, toolNamesByCallId);
      return [{
        key: `${responseKeyPrefix}:${choiceIndex}:message`,
        message,
        index: responseStartIndex + choiceIndex,
        finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : "",
        hideFinishBadge,
        reasoningCollapsed,
      }];
    }

    if (isClientRecord(choice) && typeof choice.text === "string") {
      const message = buildConversationMessageRecord({
        role: "assistant",
        content: choice.text,
      }, {
        model: resolvedModel,
        finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : "",
      });
      return [{
        key: `${responseKeyPrefix}:${choiceIndex}:text`,
        message,
        index: responseStartIndex + choiceIndex,
        finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : "",
        hideFinishBadge,
        reasoningCollapsed,
      }];
    }

    return [];
  });

  return [...requestItems, ...responseItems];
}
