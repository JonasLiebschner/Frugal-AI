import type { DashboardState, DebugTranscriptEntry } from "../types/dashboard";
import { waitForAnimationFrame } from "./browserPaint";
import { prettyJson } from "./formatters";
import { isClientRecord } from "./guards";
import {
  applyUsageMetrics,
  formatUsage,
  noteStreamingTokenActivity,
  readReasoningText,
} from "./debug-chat-metrics";
import {
  mergeDebugFunctionCall,
  mergeDebugToolCalls,
} from "./debug-chat-transcript";

type DebugStateSlice = DashboardState["debug"];
type ReplaceTranscriptEntry = (entry: DebugTranscriptEntry) => DebugTranscriptEntry;
const STREAM_UI_FLUSH_INTERVAL_MS = 24;
const DEBUG_RAW_RESPONSE_CHAR_LIMIT = 256_000;
const DEBUG_RAW_RESPONSE_TRUNCATION_MARKER = "\n...[llmproxy truncated raw stream output in the UI]";

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function appendRawResponseChunk(current: string, fragment: string): string {
  if (!fragment) {
    return current;
  }

  if (current.length >= DEBUG_RAW_RESPONSE_CHAR_LIMIT) {
    return current.endsWith(DEBUG_RAW_RESPONSE_TRUNCATION_MARKER)
      ? current
      : `${current}${DEBUG_RAW_RESPONSE_TRUNCATION_MARKER}`;
  }

  const remaining = DEBUG_RAW_RESPONSE_CHAR_LIMIT - current.length;
  if (fragment.length <= remaining) {
    return `${current}${fragment}`;
  }

  const visibleLength = Math.max(0, remaining - DEBUG_RAW_RESPONSE_TRUNCATION_MARKER.length);
  return `${current}${fragment.slice(0, visibleLength)}${DEBUG_RAW_RESPONSE_TRUNCATION_MARKER}`;
}

export function truncateDebugRawText(value: string): string {
  if (value.length <= DEBUG_RAW_RESPONSE_CHAR_LIMIT) {
    return value;
  }

  const visibleLength = Math.max(0, DEBUG_RAW_RESPONSE_CHAR_LIMIT - DEBUG_RAW_RESPONSE_TRUNCATION_MARKER.length);
  return `${value.slice(0, visibleLength)}${DEBUG_RAW_RESPONSE_TRUNCATION_MARKER}`;
}

function hasVisibleFunctionCallDelta(value: unknown): boolean {
  if (!isClientRecord(value)) {
    return false;
  }

  return (
    (typeof value.name === "string" && value.name.length > 0) ||
    (typeof value.arguments === "string" && value.arguments.length > 0)
  );
}

function hasVisibleToolCallsDelta(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.some((toolCall) => {
    if (!isClientRecord(toolCall)) {
      return false;
    }

    if (
      (typeof toolCall.id === "string" && toolCall.id.length > 0) ||
      (typeof toolCall.type === "string" && toolCall.type.length > 0)
    ) {
      return true;
    }

    if (!isClientRecord(toolCall.function)) {
      return false;
    }

    return (
      (typeof toolCall.function.name === "string" && toolCall.function.name.length > 0) ||
      (typeof toolCall.function.arguments === "string" && toolCall.function.arguments.length > 0)
    );
  });
}

function cloneStreamingToolCall(value: unknown): unknown {
  if (!isClientRecord(value)) {
    return value;
  }

  return {
    ...value,
    ...(isClientRecord(value.function) ? { function: { ...value.function } } : {}),
  };
}

function cloneStreamingAssistantTurn(entry: DebugTranscriptEntry): DebugTranscriptEntry {
  return {
    ...entry,
    ...(isClientRecord(entry.function_call) ? { function_call: { ...entry.function_call } } : {}),
    ...(Array.isArray(entry.tool_calls)
      ? { tool_calls: entry.tool_calls.map((toolCall) => cloneStreamingToolCall(toolCall)) as DebugTranscriptEntry["tool_calls"] }
      : {}),
    ...(isClientRecord(entry.audio) ? { audio: { ...entry.audio } } : {}),
  };
}

function syncStreamingAssistantTurn(
  target: DebugTranscriptEntry,
  source: DebugTranscriptEntry,
): void {
  target.role = source.role;
  target.content = source.content;
  target.reasoning_content = source.reasoning_content;
  target.refusal = source.refusal;
  target.function_call = isClientRecord(source.function_call)
    ? { ...source.function_call }
    : undefined;
  target.tool_calls = Array.isArray(source.tool_calls)
    ? source.tool_calls.map((toolCall) => cloneStreamingToolCall(toolCall)) as DebugTranscriptEntry["tool_calls"]
    : undefined;
  target.audio = isClientRecord(source.audio)
    ? { ...source.audio }
    : undefined;
  target.name = source.name;
  target.tool_call_id = source.tool_call_id;
  target.model = source.model;
  target.backend = source.backend;
  target.finish_reason = source.finish_reason;
  target.pending = source.pending;
  target.pending_title = source.pending_title;
}

export function applyNonStreamingResponse(
  debugState: DebugStateSlice,
  payload: Record<string, any>,
  assistantTurn: DebugTranscriptEntry,
  replaceTranscriptEntry: ReplaceTranscriptEntry,
): DebugTranscriptEntry {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const message = choice?.message;

  if (typeof message?.role === "string" && message.role.length > 0) {
    assistantTurn.role = message.role;
  }

  assistantTurn.content =
    message && Object.prototype.hasOwnProperty.call(message, "content")
      ? (message.content ?? null)
      : "";
  assistantTurn.reasoning_content = readReasoningText(message);
  assistantTurn.refusal = typeof message?.refusal === "string" ? message.refusal : "";
  assistantTurn.function_call = isClientRecord(message?.function_call) ? message.function_call : undefined;
  assistantTurn.tool_calls = Array.isArray(message?.tool_calls) ? message.tool_calls : undefined;
  assistantTurn.audio = isClientRecord(message?.audio) ? message.audio : undefined;
  assistantTurn.name = typeof message?.name === "string" ? message.name : "";
  assistantTurn.backend = debugState.backend;
  assistantTurn.finish_reason = typeof choice?.finish_reason === "string" ? choice.finish_reason : "";
  assistantTurn.pending = false;
  assistantTurn.pending_title = "";
  applyUsageMetrics(debugState.metrics, payload?.usage, payload?.timings, choice?.finish_reason);
  debugState.usage = formatUsage(payload?.usage, payload?.timings, choice?.finish_reason);
  debugState.rawResponse = truncateDebugRawText(prettyJson(payload));
  return replaceTranscriptEntry(assistantTurn);
}

export function applyStreamingPayload(
  debugState: DebugStateSlice,
  payload: Record<string, any>,
  assistantTurn: DebugTranscriptEntry,
): boolean {
  const choice = Array.isArray(payload?.choices) ? payload[0] : undefined;
  const normalizedChoice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const delta = normalizedChoice?.delta ?? normalizedChoice?.message ?? {};
  let updated = false;

  if (typeof delta?.role === "string" && delta.role.length > 0) {
    assistantTurn.role = delta.role;
    updated = true;
  }

  if (typeof delta?.content === "string") {
    assistantTurn.content = String(assistantTurn.content ?? "") + delta.content;
    if (delta.content.length > 0) {
      updated = true;
    }
  }

  const reasoningDelta = readReasoningText(delta);
  if (reasoningDelta) {
    assistantTurn.reasoning_content = String(assistantTurn.reasoning_content ?? "") + reasoningDelta;
    updated = true;
  }

  if (typeof delta?.refusal === "string") {
    assistantTurn.refusal = String(assistantTurn.refusal ?? "") + delta.refusal;
    if (delta.refusal.length > 0) {
      updated = true;
    }
  }

  mergeDebugFunctionCall(assistantTurn as Record<string, any>, delta?.function_call);
  mergeDebugToolCalls(assistantTurn as Record<string, any>, delta?.tool_calls);

  if (typeof normalizedChoice?.finish_reason === "string" && normalizedChoice.finish_reason.length > 0) {
    assistantTurn.finish_reason = normalizedChoice.finish_reason;
    updated = true;
  }

  if (
    (typeof delta?.content === "string" && delta.content.length > 0) ||
    Boolean(reasoningDelta) ||
    (typeof delta?.refusal === "string" && delta.refusal.length > 0) ||
    hasVisibleFunctionCallDelta(delta?.function_call) ||
    hasVisibleToolCallsDelta(delta?.tool_calls) ||
    (typeof normalizedChoice?.finish_reason === "string" && normalizedChoice.finish_reason.length > 0)
  ) {
    assistantTurn.pending = false;
    assistantTurn.pending_title = "";
  }

  assistantTurn.backend = debugState.backend;
  noteStreamingTokenActivity(debugState.metrics, delta);
  applyUsageMetrics(debugState.metrics, payload?.usage, payload?.timings, normalizedChoice?.finish_reason);
  debugState.usage = formatUsage(payload?.usage, payload?.timings, normalizedChoice?.finish_reason);
  return updated;
}

function processStreamBlock(
  debugState: DebugStateSlice,
  block: string,
  rawResponseState: { text: string; hasAny: boolean },
  assistantTurn: DebugTranscriptEntry,
): boolean {
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return false;
  }

  const payloadText = dataLines.join("\n");
  if (!payloadText || payloadText === "[DONE]") {
    return false;
  }

  rawResponseState.text = appendRawResponseChunk(
    rawResponseState.text,
    rawResponseState.hasAny ? `\n\n${payloadText}` : payloadText,
  );
  rawResponseState.hasAny = true;

  try {
    const updated = applyStreamingPayload(debugState, JSON.parse(payloadText), assistantTurn);
    return updated;
  } catch {
    return false;
  }
}

function processStreamBuffer(
  debugState: DebugStateSlice,
  buffer: string,
  rawResponseState: { text: string; hasAny: boolean },
  assistantTurn: DebugTranscriptEntry,
  flush: boolean,
): { buffer: string; assistantTurn: DebugTranscriptEntry; updated: boolean } {
  let working = buffer;
  let currentAssistantTurn = assistantTurn;
  let updated = false;

  while (true) {
    const windowsBreak = working.indexOf("\r\n\r\n");
    const unixBreak = working.indexOf("\n\n");
    let breakIndex = -1;
    let breakLength = 0;

    if (windowsBreak >= 0 && (unixBreak === -1 || windowsBreak < unixBreak)) {
      breakIndex = windowsBreak;
      breakLength = 4;
    } else if (unixBreak >= 0) {
      breakIndex = unixBreak;
      breakLength = 2;
    }

    if (breakIndex === -1) {
      break;
    }

    const block = working.slice(0, breakIndex);
    working = working.slice(breakIndex + breakLength);
    if (processStreamBlock(debugState, block, rawResponseState, currentAssistantTurn)) {
      updated = true;
    }
  }

  if (flush && working.trim()) {
    const flushed = processStreamBlock(debugState, working, rawResponseState, currentAssistantTurn);
    return {
      buffer: "",
      assistantTurn: currentAssistantTurn,
      updated: flushed,
    };
  }

  return {
    buffer: working,
    assistantTurn: currentAssistantTurn,
    updated,
  };
}

export async function consumeStreamingResponse(
  response: Response,
  debugState: DebugStateSlice,
  assistantTurn: DebugTranscriptEntry,
): Promise<DebugTranscriptEntry> {
  if (!response.body) {
    throw new Error("Streaming response had no body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const rawResponseState = {
    text: "",
    hasAny: false,
  };
  const draftAssistantTurn = cloneStreamingAssistantTurn(assistantTurn);
  let buffer = "";
  let currentAssistantTurn = draftAssistantTurn;
  let lastUiFlushAt = nowMs();

  function flushStreamingUi(forcePaint: boolean): Promise<void> | void {
    syncStreamingAssistantTurn(assistantTurn, currentAssistantTurn);
    debugState.rawResponse = rawResponseState.text;
    if (forcePaint) {
      return waitForAnimationFrame();
    }
  }

  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }

    buffer += decoder.decode(next.value, { stream: true });
    const update = processStreamBuffer(debugState, buffer, rawResponseState, currentAssistantTurn, false);
    buffer = update.buffer;
    currentAssistantTurn = update.assistantTurn;
    if (update.updated && nowMs() - lastUiFlushAt >= STREAM_UI_FLUSH_INTERVAL_MS) {
      await flushStreamingUi(true);
      lastUiFlushAt = nowMs();
    }
  }

  buffer += decoder.decode();
  {
    const update = processStreamBuffer(debugState, buffer, rawResponseState, currentAssistantTurn, true);
    currentAssistantTurn = update.assistantTurn;
    flushStreamingUi(false);
    if (update.updated) {
      await waitForAnimationFrame();
    }
  }
  flushStreamingUi(false);
  return assistantTurn;
}
