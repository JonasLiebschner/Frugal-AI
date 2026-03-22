import type {
  DebugParams,
  DebugQueuedMessage,
  DebugState,
  DebugTranscriptEntry,
} from "../types/dashboard";
import { createAssistantTurn } from "./debug-chat-transcript";

export function shouldApplyDefaultDebugPrompt(debugState: DebugState): boolean {
  if (debugState.defaultPromptDismissed) {
    return false;
  }

  if (debugState.transcript.length > 0 || debugState.queuedMessages.length > 0) {
    return false;
  }

  return debugState.systemPrompt.trim().length === 0 && debugState.prompt.trim().length === 0;
}

export function applyDefaultDebugPrompt(debugState: DebugState, prompt: string): void {
  if (!shouldApplyDefaultDebugPrompt(debugState)) {
    return;
  }

  debugState.prompt = prompt;
}

export function cloneDebugParams(source: DebugParams): DebugParams {
  return {
    temperature: source.temperature,
    top_p: source.top_p,
    top_k: source.top_k,
    min_p: source.min_p,
    repeat_penalty: source.repeat_penalty,
    max_completion_tokens: source.max_completion_tokens,
    tool_choice: source.tool_choice,
  };
}

export function cloneDebugValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneDebugValue(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneDebugValue(nestedValue)]),
    ) as T;
  }

  return value;
}

export function cloneDebugTranscriptEntry(entry: DebugTranscriptEntry): DebugTranscriptEntry {
  return cloneDebugValue(entry);
}

export function findLastSentUserTurn(transcript: DebugTranscriptEntry[]): DebugTranscriptEntry | null {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const entry = transcript[index];
    if (!entry || entry.role !== "user" || typeof entry.content !== "string") {
      continue;
    }

    const prompt = entry.content.trim();
    if (!prompt) {
      continue;
    }

    return {
      ...cloneDebugTranscriptEntry(entry),
      content: prompt,
    };
  }

  return null;
}

export function queueDebugMessage(debugState: DebugState): boolean {
  const prompt = debugState.prompt.trim();
  if (!prompt) {
    return false;
  }

  const queuedMessage: DebugQueuedMessage = {
    prompt,
    model: debugState.model,
    enableDiagnosticTools: debugState.enableDiagnosticTools,
    params: cloneDebugParams(debugState.params),
  };

  debugState.queuedMessages.push(queuedMessage);
  debugState.prompt = "";
  return true;
}

export function shiftQueuedDebugMessage(debugState: DebugState): DebugQueuedMessage | null {
  return debugState.queuedMessages.shift() ?? null;
}

export function createPendingAssistantTurn(waitingTitle: string): DebugTranscriptEntry {
  return {
    ...createAssistantTurn(),
    pending: true,
    pending_title: waitingTitle,
  };
}
