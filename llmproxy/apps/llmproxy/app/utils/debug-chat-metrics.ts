import type { DebugMetrics } from "../types/dashboard";
import { formatTokenRate } from "./formatters";
import { isClientRecord } from "./guards";

interface DebugPayloadCounts {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  promptMs: number | null;
  generationMs: number | null;
  promptPerSecond: number | null;
  completionPerSecond: number | null;
}

function estimateTokenCount(value: unknown): number {
  if (typeof value !== "string" || value.length === 0) {
    return 0;
  }

  return Math.max(1, value.trim().split(/\s+/).filter(Boolean).length);
}

export function createInitialDebugMetrics(): DebugMetrics {
  return {
    startedAt: 0,
    firstTokenAt: 0,
    lastTokenAt: 0,
    promptTokens: null,
    completionTokens: 0,
    totalTokens: null,
    contentTokens: 0,
    reasoningTokens: 0,
    promptMs: null,
    generationMs: null,
    promptPerSecond: null,
    completionPerSecond: null,
    finishReason: "",
  };
}

export function createClientDebugRequestId(): string {
  if (typeof window !== "undefined" && typeof window.crypto?.randomUUID === "function") {
    return `dbg_${window.crypto.randomUUID()}`;
  }

  return `dbg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function readReasoningText(value: unknown): string {
  if (!isClientRecord(value)) {
    return "";
  }

  if (typeof value.reasoning_content === "string") {
    return value.reasoning_content;
  }

  if (typeof value.reasoning === "string") {
    return value.reasoning;
  }

  if (typeof value.thinking === "string") {
    return value.thinking;
  }

  return "";
}

export function readPayloadCounts(payload: Record<string, any>): DebugPayloadCounts {
  const usage = isClientRecord(payload?.usage) ? payload.usage : null;
  const timings = isClientRecord(payload?.timings) ? payload.timings : null;

  return {
    promptTokens: typeof usage?.prompt_tokens === "number"
      ? usage.prompt_tokens
      : (typeof timings?.prompt_n === "number" ? timings.prompt_n : null),
    completionTokens: typeof usage?.completion_tokens === "number"
      ? usage.completion_tokens
      : (typeof timings?.predicted_n === "number" ? timings.predicted_n : null),
    totalTokens: typeof usage?.total_tokens === "number"
      ? usage.total_tokens
      : null,
    promptMs: typeof timings?.prompt_ms === "number" ? timings.prompt_ms : null,
    generationMs: typeof timings?.predicted_ms === "number" ? timings.predicted_ms : null,
    promptPerSecond: typeof timings?.prompt_per_second === "number" ? timings.prompt_per_second : null,
    completionPerSecond: typeof timings?.predicted_per_second === "number" ? timings.predicted_per_second : null,
  };
}

export function noteStreamingTokenActivity(metrics: DebugMetrics, delta: Record<string, any>): void {
  const now = Date.now();
  const addedContentTokens = estimateTokenCount(delta?.content);
  const addedReasoningTokens = estimateTokenCount(readReasoningText(delta));
  const addedCompletionTokens = addedContentTokens + addedReasoningTokens;

  if (addedCompletionTokens <= 0) {
    return;
  }

  if (!metrics.firstTokenAt) {
    metrics.firstTokenAt = now;
  }

  metrics.lastTokenAt = now;
  metrics.completionTokens += addedCompletionTokens;
  metrics.contentTokens += addedContentTokens;
  metrics.reasoningTokens += addedReasoningTokens;

  if (typeof metrics.promptTokens === "number") {
    metrics.totalTokens = metrics.promptTokens + metrics.completionTokens;
  }

  if (metrics.firstTokenAt) {
    metrics.completionPerSecond = metrics.completionTokens / Math.max(0.001, (now - metrics.firstTokenAt) / 1000);
  }
}

export function applyUsageMetrics(
  metrics: DebugMetrics,
  usage: unknown,
  timings: unknown,
  finishReason: unknown,
): void {
  const counts = readPayloadCounts({ usage, timings });

  if (typeof counts.promptTokens === "number") {
    metrics.promptTokens = counts.promptTokens;
  }

  if (typeof counts.completionTokens === "number") {
    metrics.completionTokens = counts.completionTokens;
  }

  if (typeof counts.totalTokens === "number") {
    metrics.totalTokens = counts.totalTokens;
  } else if (typeof metrics.promptTokens === "number") {
    metrics.totalTokens = metrics.promptTokens + metrics.completionTokens;
  }

  if (typeof counts.promptMs === "number") {
    metrics.promptMs = counts.promptMs;
  }

  if (typeof counts.generationMs === "number") {
    metrics.generationMs = counts.generationMs;
  }

  if (typeof counts.promptPerSecond === "number") {
    metrics.promptPerSecond = counts.promptPerSecond;
  }

  if (typeof counts.completionPerSecond === "number") {
    metrics.completionPerSecond = counts.completionPerSecond;
  }

  if (typeof finishReason === "string") {
    metrics.finishReason = finishReason;
  }
}

export function formatUsage(usage: unknown, timings: unknown, finishReason: unknown): string {
  const counts = readPayloadCounts({ usage, timings });
  const parts: string[] = [];

  if (typeof finishReason === "string" && finishReason.length > 0) {
    parts.push(`finish ${finishReason}`);
  }

  if (typeof counts.promptTokens === "number") {
    parts.push(`${counts.promptTokens} prompt`);
  }

  if (typeof counts.completionTokens === "number") {
    parts.push(`${counts.completionTokens} completion`);
  }

  if (typeof counts.totalTokens === "number") {
    parts.push(`${counts.totalTokens} total`);
  }

  const rate = formatTokenRate(counts.completionPerSecond);
  if (rate) {
    parts.push(rate);
  }

  return parts.join(" | ");
}
