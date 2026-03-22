import { formatDate } from "./formatters";
import type { RequestCatalogRow } from "./request-catalog";
import { entryTokenCount, formatLogDate, formatLogTime, noteSummary } from "./requests-table-display";
import { hasDiagnosticIssue, matchesOutcomeFilter } from "./requests-table-outcomes";
import { compareRequestEntries } from "./requests-table-sorting";
import {
  type RequestFilterKey,
  type RequestSortDirection,
  type RequestSortKey,
  type RequestTableFilters,
} from "./requests-table";

const supportedOutcomeFilters = new Set([
  "all",
  "queued",
  "connected",
  "streaming",
  "success",
  "completed",
  "error",
  "cancelled",
  "rejected",
  "queued_timeout",
]);

export function createRequestTableFilters(): RequestTableFilters {
  return {
    issues: "all",
    time: "",
    outcome: "all",
    finishReason: "all",
    type: "all",
    request: "",
    model: "all",
    middleware: "all",
    routing: "all",
    backend: "all",
    queueComparator: "any",
    queueValue: "",
    latencyComparator: "any",
    latencyValue: "",
    tokensComparator: "any",
    tokensValue: "",
    maxTokensComparator: "any",
    maxTokensValue: "",
    energyComparator: "any",
    energyValue: "",
    rateComparator: "any",
    rateValue: "",
    note: "",
  };
}

export function normalizeOutcomeFilterValue(value: unknown): string {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (typeof rawValue !== "string") {
    return "all";
  }

  const normalized = rawValue.trim();
  if (!normalized) {
    return "all";
  }

  if (supportedOutcomeFilters.has(normalized) || normalized.startsWith("finish:")) {
    return normalized;
  }

  return "all";
}

function matchesText(query: string, values: Array<string | undefined>): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return values
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function matchesNumeric(
  value: number | null | undefined,
  comparator: string,
  rawFilterValue: string,
): boolean {
  if (comparator === "any") {
    return true;
  }

  const filterValue = Number(rawFilterValue.trim());
  if (!Number.isFinite(filterValue)) {
    return true;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    return false;
  }

  if (comparator === "gt") {
    return value > filterValue;
  }

  if (comparator === "gte") {
    return value >= filterValue;
  }

  if (comparator === "eq") {
    return value === filterValue;
  }

  if (comparator === "lte") {
    return value <= filterValue;
  }

  if (comparator === "lt") {
    return value < filterValue;
  }

  return true;
}

function hasNumericFilterValue(rawFilterValue: string): boolean {
  return rawFilterValue.trim().length > 0;
}

function hasActiveNumericFilter(comparator: string, rawFilterValue: string): boolean {
  return comparator !== "any" && hasNumericFilterValue(rawFilterValue);
}

export function filterRequestEntries(
  entries: RequestCatalogRow[],
  filters: RequestTableFilters,
  shortId: (value: string) => string,
): RequestCatalogRow[] {
  return entries.filter((entry) => {
    if (filters.issues === "problematic" && !hasDiagnosticIssue(entry)) {
      return false;
    }

    if (filters.issues === "clean" && hasDiagnosticIssue(entry)) {
      return false;
    }

    if (!matchesText(filters.time, [formatDate(entry.time), formatLogDate(entry.time), formatLogTime(entry.time), entry.time])) {
      return false;
    }

    if (!matchesOutcomeFilter(entry, filters.outcome)) {
      return false;
    }

    if (filters.finishReason === "none" && entry.finishReason) {
      return false;
    }

    if (filters.finishReason !== "all" && filters.finishReason !== "none" && (entry.finishReason ?? "") !== filters.finishReason) {
      return false;
    }

    if (filters.type !== "all" && (entry.requestType ?? "") !== filters.type) {
      return false;
    }

    if (!matchesText(filters.request, [entry.id, shortId(entry.id), entry.method, entry.path, `${entry.method} ${entry.path}`])) {
      return false;
    }

    if (filters.model !== "all" && (entry.model ?? "") !== filters.model) {
      return false;
    }

    if (filters.middleware !== "all" && (entry.routingMiddlewareId ?? "") !== filters.middleware) {
      return false;
    }

    if (filters.routing !== "all" && (entry.routingMiddlewareProfile ?? "") !== filters.routing) {
      return false;
    }

    if (filters.backend !== "all" && (entry.backendName ?? "") !== filters.backend) {
      return false;
    }

    if (!matchesNumeric(entry.queuedMs, filters.queueComparator, filters.queueValue)) {
      return false;
    }

    if (!matchesNumeric(entry.latencyMs, filters.latencyComparator, filters.latencyValue)) {
      return false;
    }

    if (!matchesNumeric(entryTokenCount(entry), filters.tokensComparator, filters.tokensValue)) {
      return false;
    }

    if (!matchesNumeric(entry.effectiveCompletionTokenLimit, filters.maxTokensComparator, filters.maxTokensValue)) {
      return false;
    }

    if (!matchesNumeric(entry.energyUsageWh, filters.energyComparator, filters.energyValue)) {
      return false;
    }

    if (!matchesNumeric(entry.completionTokensPerSecond, filters.rateComparator, filters.rateValue)) {
      return false;
    }

    if (!matchesText(filters.note, [noteSummary(entry)])) {
      return false;
    }

    return true;
  });
}

export function sortRequestEntries(
  entries: RequestCatalogRow[],
  sortKey: RequestSortKey | "",
  sortDirection: RequestSortDirection,
): RequestCatalogRow[] {
  if (!sortKey || !sortDirection) {
    return entries;
  }

  const direction = sortDirection === "asc" ? 1 : -1;
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const comparison = compareRequestEntries(left.entry, right.entry, sortKey);
      if (comparison !== 0) {
        return comparison * direction;
      }

      return left.index - right.index;
    })
    .map(({ entry }) => entry);
}

export function hasActiveRequestFilters(filters: RequestTableFilters): boolean {
  return (
    filters.issues !== "all" ||
    filters.time.trim().length > 0 ||
    filters.outcome !== "all" ||
    filters.finishReason !== "all" ||
    filters.type !== "all" ||
    filters.request.trim().length > 0 ||
    filters.model !== "all" ||
    filters.middleware !== "all" ||
    filters.routing !== "all" ||
    filters.backend !== "all" ||
    hasActiveNumericFilter(filters.queueComparator, filters.queueValue) ||
    hasActiveNumericFilter(filters.latencyComparator, filters.latencyValue) ||
    hasActiveNumericFilter(filters.tokensComparator, filters.tokensValue) ||
    hasActiveNumericFilter(filters.maxTokensComparator, filters.maxTokensValue) ||
    hasActiveNumericFilter(filters.energyComparator, filters.energyValue) ||
    hasActiveNumericFilter(filters.rateComparator, filters.rateValue) ||
    filters.note.trim().length > 0
  );
}

export function isRequestFilterActive(filters: RequestTableFilters, filterKey: RequestFilterKey): boolean {
  if (filterKey === "issues") {
    return filters.issues !== "all";
  }

  if (filterKey === "time") {
    return filters.time.trim().length > 0;
  }

  if (filterKey === "outcome") {
    return filters.outcome !== "all";
  }

  if (filterKey === "finishReason") {
    return filters.finishReason !== "all";
  }

  if (filterKey === "type") {
    return filters.type !== "all";
  }

  if (filterKey === "request") {
    return filters.request.trim().length > 0;
  }

  if (filterKey === "model") {
    return filters.model !== "all";
  }

  if (filterKey === "middleware") {
    return filters.middleware !== "all";
  }

  if (filterKey === "routing") {
    return filters.routing !== "all";
  }

  if (filterKey === "backend") {
    return filters.backend !== "all";
  }

  if (filterKey === "queue") {
    return hasActiveNumericFilter(filters.queueComparator, filters.queueValue);
  }

  if (filterKey === "latency") {
    return hasActiveNumericFilter(filters.latencyComparator, filters.latencyValue);
  }

  if (filterKey === "tokens") {
    return hasActiveNumericFilter(filters.tokensComparator, filters.tokensValue);
  }

  if (filterKey === "maxTokens") {
    return hasActiveNumericFilter(filters.maxTokensComparator, filters.maxTokensValue);
  }

  if (filterKey === "energy") {
    return hasActiveNumericFilter(filters.energyComparator, filters.energyValue);
  }

  if (filterKey === "rate") {
    return hasActiveNumericFilter(filters.rateComparator, filters.rateValue);
  }

  return filters.note.trim().length > 0;
}

export function resetRequestFilters(filters: RequestTableFilters): void {
  Object.assign(filters, createRequestTableFilters());
}

export function clearRequestFilter(filters: RequestTableFilters, filterKey: RequestFilterKey): void {
  if (filterKey === "issues") {
    filters.issues = "all";
    return;
  }

  if (filterKey === "time") {
    filters.time = "";
    return;
  }

  if (filterKey === "outcome") {
    filters.outcome = "all";
    return;
  }

  if (filterKey === "finishReason") {
    filters.finishReason = "all";
    return;
  }

  if (filterKey === "type") {
    filters.type = "all";
    return;
  }

  if (filterKey === "request") {
    filters.request = "";
    return;
  }

  if (filterKey === "model") {
    filters.model = "all";
    return;
  }

  if (filterKey === "middleware") {
    filters.middleware = "all";
    return;
  }

  if (filterKey === "routing") {
    filters.routing = "all";
    return;
  }

  if (filterKey === "backend") {
    filters.backend = "all";
    return;
  }

  if (filterKey === "queue") {
    filters.queueComparator = "any";
    filters.queueValue = "";
    return;
  }

  if (filterKey === "latency") {
    filters.latencyComparator = "any";
    filters.latencyValue = "";
    return;
  }

  if (filterKey === "tokens") {
    filters.tokensComparator = "any";
    filters.tokensValue = "";
    return;
  }

  if (filterKey === "maxTokens") {
    filters.maxTokensComparator = "any";
    filters.maxTokensValue = "";
    return;
  }

  if (filterKey === "energy") {
    filters.energyComparator = "any";
    filters.energyValue = "";
    return;
  }

  if (filterKey === "rate") {
    filters.rateComparator = "any";
    filters.rateValue = "";
    return;
  }

  filters.note = "";
}
