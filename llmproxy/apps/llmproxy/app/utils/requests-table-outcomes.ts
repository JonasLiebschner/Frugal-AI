import { describeFinishReason } from "./dashboard-badges";
import type { RequestCatalogRow } from "./request-catalog";

function finishOutcomeKey(finishReason: string): string {
  return `finish:${finishReason}`;
}

function logOutcomeKey(entry: RequestCatalogRow): string {
  if (entry.outcome === "queued" || entry.outcome === "connected" || entry.outcome === "streaming") {
    return entry.outcome;
  }

  if (entry.outcome === "success" && entry.finishReason) {
    return finishOutcomeKey(entry.finishReason);
  }

  if (entry.outcome === "success") {
    return "completed";
  }

  return entry.outcome;
}

function isRejectedOutcome(entry: RequestCatalogRow): boolean {
  return entry.outcome !== "success" && !entry.backendId;
}

export function hasDiagnosticIssue(entry: RequestCatalogRow): boolean {
  return entry.diagnosticSeverity === "warn" || entry.diagnosticSeverity === "bad";
}

export function diagnosticIssueTitle(entry: RequestCatalogRow): string {
  if (!hasDiagnosticIssue(entry)) {
    return "No heuristic issue detected for this stored request.";
  }

  const title = entry.diagnosticTitle?.trim();
  const summary = entry.diagnosticSummary?.trim();
  if (title && summary) {
    return `${title}: ${summary}`;
  }

  return summary || title || "llmproxy's heuristic diagnostics found a likely issue for this request.";
}

export function matchesOutcomeFilter(entry: RequestCatalogRow, filterValue: string): boolean {
  if (filterValue === "all") {
    return true;
  }

  if (filterValue === "queued" || filterValue === "connected" || filterValue === "streaming") {
    return entry.outcome === filterValue;
  }

  if (filterValue === "success") {
    return entry.outcome === "success";
  }

  if (filterValue === "completed") {
    return entry.outcome === "success" && !entry.finishReason;
  }

  if (filterValue === "error") {
    return entry.outcome === "error" && Boolean(entry.backendId);
  }

  if (filterValue === "cancelled") {
    return entry.outcome === "cancelled" && Boolean(entry.backendId);
  }

  if (filterValue === "rejected") {
    return isRejectedOutcome(entry);
  }

  if (filterValue === "queued_timeout") {
    return entry.outcome === "queued_timeout";
  }

  if (filterValue.startsWith("finish:")) {
    return entry.outcome === "success" && finishOutcomeKey(entry.finishReason ?? "") === filterValue;
  }

  return logOutcomeKey(entry) === filterValue;
}

export function outcomeBadgeClass(entry: RequestCatalogRow): string {
  if (entry.outcome === "streaming") {
    return "badge good";
  }

  if (entry.outcome === "queued" || entry.outcome === "connected") {
    return "badge warn";
  }

  if (entry.outcome === "success") {
    return "badge good";
  }

  if (entry.outcome === "queued_timeout" || entry.outcome === "cancelled") {
    return "badge warn";
  }

  return "badge bad";
}

export function outcomeLabel(entry: RequestCatalogRow): string {
  if (entry.outcome === "queued") {
    return "queued";
  }

  if (entry.outcome === "connected") {
    return "connected";
  }

  if (entry.outcome === "streaming") {
    return "streaming";
  }

  if (entry.outcome === "success") {
    return "success";
  }

  if (entry.outcome === "queued_timeout") {
    return "queue timeout";
  }

  return entry.outcome;
}

export function outcomeTitle(entry: RequestCatalogRow): string {
  if (entry.outcome === "queued") {
    return "This live request is still waiting in the scheduler queue for a free backend slot.";
  }

  if (entry.outcome === "connected") {
    return "This live request already has a backend assigned, but the response has not started streaming yet.";
  }

  if (entry.outcome === "streaming") {
    return "This live request is currently streaming or actively generating.";
  }

  if (entry.outcome === "success") {
    return "The request completed successfully.";
  }

  if (entry.outcome === "queued_timeout") {
    return "The request timed out while waiting in the queue.";
  }

  if (entry.outcome === "cancelled") {
    return "The request was cancelled before completion.";
  }

  return "The request failed while being proxied or upstream.";
}

export function finishReasonSummary(entry: RequestCatalogRow): string {
  return entry.finishReason || "-";
}

export function finishReasonTitle(entry: RequestCatalogRow): string {
  if (entry.finishReason) {
    return describeFinishReason(entry.finishReason);
  }

  if (entry.live) {
    return "No finish reason is available yet because this request has not reached a final backend response state.";
  }

  return "The backend did not report a finish reason for this request.";
}
