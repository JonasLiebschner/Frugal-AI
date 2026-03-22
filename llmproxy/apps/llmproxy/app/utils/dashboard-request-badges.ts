import type { RequestLogEntry, UiBadge } from "../types/dashboard";
import { formatDate, formatDuration } from "./formatters";
import { badgeSpec, describeFinishReason } from "./dashboard-badges";

export function buildRequestStateBadge(entry?: RequestLogEntry, live = false): UiBadge | null {
  if (!entry) {
    return null;
  }

  if (live) {
    return badgeSpec("running", "warn", "This request is still active and has not reached a final state yet.");
  }

  return buildRequestOutcomeBadge(entry);
}

export function buildRecentRequestBadges(entry: RequestLogEntry): UiBadge[] {
  const items: UiBadge[] = [
    buildRequestOutcomeBadge(entry),
    badgeSpec(formatDate(entry.time), "neutral", "Time when this request finished and was added to recent history."),
    badgeSpec(`latency ${formatDuration(entry.latencyMs)}`, "neutral", "End-to-end request latency."),
    badgeSpec(`queued ${formatDuration(entry.queuedMs)}`, "neutral", "Time spent waiting for a free backend slot."),
  ];

  if (entry.backendName) {
    items.push(badgeSpec(`backend ${entry.backendName}`, "good", "Backend that served this request."));
  }

  if (entry.model) {
    items.push(badgeSpec(`model ${entry.model}`, "neutral", "Requested model name."));
  }

  items.push(...buildRequestRoutingBadges(entry));

  if (entry.statusCode !== undefined) {
    items.push(badgeSpec(
      `HTTP ${entry.statusCode}`,
      entry.statusCode < 200 || entry.statusCode >= 300 ? "bad" : "good",
      "Final upstream status code.",
    ));
  }

  if (entry.finishReason) {
    items.push(badgeSpec(`finish ${entry.finishReason}`, "good", describeFinishReason(entry.finishReason)));
  }

  if (entry.hasDetail) {
    items.push(badgeSpec("details", "neutral", "Open the full request/response inspector for this request."));
  }

  if (entry.error) {
    items.push(badgeSpec(entry.error, "bad", "Stored error message for this request."));
  }

  return items;
}

export function buildRequestRoutingBadges(entry?: RequestLogEntry): UiBadge[] {
  if (!entry) {
    return [];
  }

  const items: UiBadge[] = [];

  if (entry.routingMiddlewareId) {
    items.push(badgeSpec(
      `middleware ${entry.routingMiddlewareId}`,
      "neutral",
      "AI request middleware that was explicitly selected for this request.",
    ));
  }

  if (entry.routingMiddlewareProfile) {
    items.push(badgeSpec(
      `outcome ${entry.routingMiddlewareProfile}`,
      "neutral",
      "Routing outcome returned by the selected AI request middleware. This can be a classification or a direct routed model.",
    ));
  }

  return items;
}

function buildRequestOutcomeBadge(entry: RequestLogEntry): UiBadge {
  if (entry.outcome === "success") {
    return badgeSpec("ok", "good", "The request completed successfully.");
  }

  if (entry.outcome === "queued_timeout") {
    return badgeSpec("queue timeout", "warn", "The request timed out while waiting in the queue.");
  }

  if (entry.outcome === "cancelled") {
    return badgeSpec("cancelled", "warn", "The request was cancelled before completion.");
  }

  return badgeSpec("error", "bad", "The request failed while being proxied or upstream.");
}
