import { toRaw } from "vue";
import type { DebugTranscriptEntry } from "../types/dashboard";
import { isClientRecord } from "./guards";
import { hasVisibleMessageContent } from "./message-content";

export interface DebugToolCallRequest {
  id: string;
  name: string;
  args: unknown;
}

export function createAssistantTurn(): DebugTranscriptEntry {
  return {
    role: "assistant",
    content: "",
    reasoning_content: "",
    backend: "",
    finish_reason: "",
  };
}

function cloneDebugToolCall(value: unknown): unknown {
  if (!isClientRecord(value)) {
    return value;
  }

  return {
    ...value,
    ...(isClientRecord(value.function) ? { function: { ...value.function } } : {}),
  };
}

export function replaceTranscriptEntry(
  transcript: DebugTranscriptEntry[],
  entry: DebugTranscriptEntry,
): DebugTranscriptEntry {
  const entryRaw = toRaw(entry);
  const index = transcript.findIndex((candidate) => toRaw(candidate) === entryRaw);
  if (index === -1) {
    return entry;
  }

  const nextEntry: DebugTranscriptEntry = {
    ...entry,
    ...(isClientRecord(entry.function_call) ? { function_call: { ...entry.function_call } } : {}),
    ...(isClientRecord(entry.audio) ? { audio: { ...entry.audio } } : {}),
    ...(Array.isArray(entry.tool_calls)
      ? { tool_calls: entry.tool_calls.map((toolCall) => cloneDebugToolCall(toolCall)) as DebugTranscriptEntry["tool_calls"] }
      : {}),
  };

  transcript.splice(index, 1, nextEntry);
  return transcript[index] as DebugTranscriptEntry;
}

export function mergeDebugFunctionCall(target: Record<string, any>, value: unknown): void {
  if (!isClientRecord(value)) {
    return;
  }

  const nextFunctionCall: Record<string, any> = isClientRecord(target.function_call)
    ? { ...target.function_call }
    : { arguments: "" };

  if (typeof value.name === "string" && value.name.length > 0) {
    nextFunctionCall.name = value.name;
  }

  if (typeof value.arguments === "string") {
    nextFunctionCall.arguments = String(nextFunctionCall.arguments ?? "") + value.arguments;
  }

  target.function_call = nextFunctionCall;
}

export function mergeDebugToolCalls(target: Record<string, any>, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }

  const nextToolCalls = Array.isArray(target.tool_calls)
    ? target.tool_calls.filter((toolCall: any) => isClientRecord(toolCall)).map((toolCall: any) => ({ ...toolCall }))
    : [];

  for (let index = 0; index < value.length; index += 1) {
    const rawToolCall = value[index];
    if (!isClientRecord(rawToolCall)) {
      continue;
    }

    const toolCallIndex = typeof rawToolCall.index === "number" ? rawToolCall.index : index;
    const existingIndex = nextToolCalls.findIndex((toolCall: any) => toolCall.index === toolCallIndex);
    const existingToolCall: Record<string, any> = existingIndex >= 0 && isClientRecord(nextToolCalls[existingIndex])
      ? { ...nextToolCalls[existingIndex] }
      : { index: toolCallIndex };

    if (typeof rawToolCall.id === "string" && rawToolCall.id.length > 0) {
      existingToolCall.id = rawToolCall.id;
    }

    if (typeof rawToolCall.type === "string" && rawToolCall.type.length > 0) {
      existingToolCall.type = rawToolCall.type;
    }

    if (isClientRecord(rawToolCall.function)) {
      const nextFunction: Record<string, any> = isClientRecord(existingToolCall.function)
        ? { ...existingToolCall.function }
        : { arguments: "" };

      if (typeof rawToolCall.function.name === "string" && rawToolCall.function.name.length > 0) {
        nextFunction.name = rawToolCall.function.name;
      }

      if (typeof rawToolCall.function.arguments === "string") {
        nextFunction.arguments = String(nextFunction.arguments ?? "") + rawToolCall.function.arguments;
      }

      existingToolCall.function = nextFunction;
    }

    if (existingIndex >= 0) {
      nextToolCalls[existingIndex] = existingToolCall;
    } else {
      nextToolCalls.push(existingToolCall);
    }
  }

  target.tool_calls = nextToolCalls.sort((left: any, right: any) => left.index - right.index);
}

export function buildDebugHistoryMessage(entry: DebugTranscriptEntry): Record<string, any> | null {
  if (!isClientRecord(entry) || typeof entry.role !== "string") {
    return null;
  }

  const message: Record<string, any> = {
    role: entry.role,
  };

  if (Object.prototype.hasOwnProperty.call(entry, "content")) {
    message.content = entry.content ?? null;
  }

  if (typeof entry.name === "string" && entry.name.length > 0) {
    message.name = entry.name;
  }

  if (typeof entry.tool_call_id === "string" && entry.tool_call_id.length > 0) {
    message.tool_call_id = entry.tool_call_id;
  }

  if (isClientRecord(entry.function_call)) {
    message.function_call = entry.function_call;
  }

  if (Array.isArray(entry.tool_calls) && entry.tool_calls.length > 0) {
    message.tool_calls = entry.tool_calls;
  }

  if (typeof entry.refusal === "string" && entry.refusal.length > 0) {
    message.refusal = entry.refusal;
  }

  return message;
}

export function hasReplayableDebugMessage(message: Record<string, any> | null): boolean {
  if (!isClientRecord(message) || typeof message.role !== "string") {
    return false;
  }

  if (hasVisibleMessageContent(message.content)) {
    return true;
  }

  if (typeof message.refusal === "string" && message.refusal.length > 0) {
    return true;
  }

  if (isClientRecord(message.function_call)) {
    return true;
  }

  return Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
}

export function hasVisibleAssistantTurnPayload(entry: DebugTranscriptEntry): boolean {
  return (
    hasVisibleMessageContent(entry.content) ||
    Boolean(entry.reasoning_content) ||
    (typeof entry.refusal === "string" && entry.refusal.length > 0) ||
    isClientRecord(entry.function_call) ||
    (Array.isArray(entry.tool_calls) && entry.tool_calls.length > 0)
  );
}

export function normalizeDebugToolArgumentsForTransport(value: unknown): unknown {
  return value;
}

export function extractDebugToolCalls(entry: DebugTranscriptEntry): DebugToolCallRequest[] {
  if (!Array.isArray(entry.tool_calls)) {
    return [];
  }

  const calls: DebugToolCallRequest[] = [];

  for (const toolCall of entry.tool_calls) {
    if (!isClientRecord(toolCall)) {
      continue;
    }

    const toolCallRecord = toolCall as Record<string, unknown>;
    if (!isClientRecord(toolCallRecord.function)) {
      continue;
    }

    const functionRecord = toolCallRecord.function as Record<string, unknown>;
    if (typeof functionRecord.name !== "string") {
      continue;
    }

    calls.push({
      id: typeof toolCallRecord.id === "string" && toolCallRecord.id.length > 0
        ? toolCallRecord.id
        : `${functionRecord.name}_${calls.length}`,
      name: functionRecord.name,
      args: normalizeDebugToolArgumentsForTransport(functionRecord.arguments),
    });
  }

  return calls;
}
