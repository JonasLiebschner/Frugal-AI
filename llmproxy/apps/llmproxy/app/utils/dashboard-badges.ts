import type { UiBadge } from "../types/dashboard";

export function describeFinishReason(reason: string): string {
  if (reason === "stop") {
    return 'Final finish reason reported by the backend. "stop" means the generation ended normally.';
  }

  if (reason === "length") {
    return 'Final finish reason reported by the backend. "length" usually means generation stopped because the token limit was reached.';
  }

  if (reason === "content_filter") {
    return 'Final finish reason reported by the backend. "content_filter" means output was stopped by a safety/content filter.';
  }

  if (reason === "tool_calls") {
    return 'Final finish reason reported by the backend. "tool_calls" means the model stopped because it emitted tool calls.';
  }

  return "Final finish reason reported by the backend for this request.";
}

export function badgeSpec(
  text: string,
  tone: "good" | "warn" | "bad" | "neutral",
  title = "",
): UiBadge {
  return { text, tone, title };
}

export function buildModelIdentityBadge(
  model: string,
  title = `Model that produced this response: ${model}.`,
): UiBadge {
  return {
    text: model,
    title,
    className: "badge identity-model",
  };
}

export function badgeClass(badge: UiBadge): string {
  return badge.className || `badge ${badge.tone ?? "neutral"}`;
}
