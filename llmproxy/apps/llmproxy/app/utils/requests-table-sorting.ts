import type { RequestCatalogRow } from "./request-catalog";
import { entryTokenCount, noteSummary } from "./requests-table-display";
import { outcomeLabel } from "./requests-table-outcomes";
import type { RequestSortKey } from "./requests-table";

function compareNumberValues(left: number, right: number): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function compareNullableNumbers(left: number | null | undefined, right: number | null | undefined): number {
  if (left == null && right == null) {
    return 0;
  }

  if (left == null) {
    return 1;
  }

  if (right == null) {
    return -1;
  }

  return compareNumberValues(left, right);
}

function compareTextValues(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
}

export function compareRequestEntries(left: RequestCatalogRow, right: RequestCatalogRow, key: RequestSortKey): number {
  if (key === "time") {
    return compareNumberValues(Date.parse(left.time), Date.parse(right.time));
  }

  if (key === "queue") {
    return compareNumberValues(left.queuedMs, right.queuedMs);
  }

  if (key === "latency") {
    return compareNumberValues(left.latencyMs, right.latencyMs);
  }

  if (key === "tokens") {
    return compareNullableNumbers(entryTokenCount(left), entryTokenCount(right));
  }

  if (key === "maxTokens") {
    return compareNullableNumbers(left.effectiveCompletionTokenLimit, right.effectiveCompletionTokenLimit);
  }

  if (key === "energy") {
    return compareNullableNumbers(left.energyUsageWh, right.energyUsageWh);
  }

  if (key === "rate") {
    return compareNullableNumbers(left.completionTokensPerSecond, right.completionTokensPerSecond);
  }

  if (key === "outcome") {
    return compareTextValues(outcomeLabel(left), outcomeLabel(right));
  }

  if (key === "finishReason") {
    return compareTextValues(left.finishReason ?? "", right.finishReason ?? "");
  }

  if (key === "type") {
    return compareTextValues(left.requestType ?? "", right.requestType ?? "");
  }

  if (key === "request") {
    return compareTextValues(`${left.method} ${left.path} ${left.id}`, `${right.method} ${right.path} ${right.id}`);
  }

  if (key === "model") {
    return compareTextValues(left.model ?? "", right.model ?? "");
  }

  if (key === "middleware") {
    return compareTextValues(left.routingMiddlewareId ?? "", right.routingMiddlewareId ?? "");
  }

  if (key === "routing") {
    return compareTextValues(left.routingMiddlewareProfile ?? "", right.routingMiddlewareProfile ?? "");
  }

  if (key === "backend") {
    return compareTextValues(left.backendName ?? "", right.backendName ?? "");
  }

  return compareTextValues(noteSummary(left), noteSummary(right));
}
