import type { DashboardState } from "../types/dashboard";
import { createInitialDebugMetrics } from "./debug-chat-metrics";

export const DEBUG_CHAT_RESPONSE_TIMEOUT_MS = 15_000;

export function isExpectedDebugAbort(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function resetDebugMetricsState(state: Pick<DashboardState, "debug">): void {
  state.debug.metrics = createInitialDebugMetrics();
}

export function stopDebugMetricsTicker(metricsTicker?: number): number | undefined {
  if (metricsTicker !== undefined) {
    window.clearInterval(metricsTicker);
  }

  return undefined;
}

export function startDebugMetricsTicker(
  state: Pick<DashboardState, "debug">,
  metricsTicker?: number,
): number {
  stopDebugMetricsTicker(metricsTicker);

  return window.setInterval(() => {
    const metrics = state.debug.metrics;
    if (!metrics.startedAt) {
      return;
    }

    if (!metrics.firstTokenAt || metrics.completionPerSecond || metrics.completionTokens === 0) {
      return;
    }

    const seconds = Math.max(0.001, (Date.now() - metrics.firstTokenAt) / 1000);
    metrics.completionPerSecond = metrics.completionTokens / seconds;
  }, 200);
}

export function resetDebugChatState(
  state: Pick<DashboardState, "debug">,
  options: {
    systemPrompt?: string;
    prompt?: string;
    defaultPromptDismissed?: boolean;
  } = {},
): void {
  state.debug.sending = false;
  state.debug.abortController = null;
  state.debug.transcript = [];
  state.debug.queuedMessages.splice(0);
  state.debug.rawRequest = "";
  state.debug.rawResponse = "";
  state.debug.status = "";
  state.debug.usage = "";
  state.debug.error = "";
  state.debug.backend = "";
  state.debug.lastRequestId = "";
  state.debug.systemPrompt = options.systemPrompt ?? "";
  state.debug.prompt = options.prompt ?? "";
  state.debug.defaultPromptDismissed = options.defaultPromptDismissed ?? true;
  resetDebugMetricsState(state);
}
