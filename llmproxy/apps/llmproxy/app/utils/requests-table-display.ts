import { formatDate, formatEnergyUsageWh, formatTokenRate } from "./formatters";
import type { RequestCatalogRow } from "./request-catalog";

const logDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "short",
});

const logTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeStyle: "short",
});

export function entryTokenCount(entry: RequestCatalogRow): number | null {
  if (typeof entry.completionTokens === "number") {
    return entry.completionTokens;
  }

  if (typeof entry.totalTokens === "number") {
    return entry.totalTokens;
  }

  const derived = (entry.contentTokens ?? 0) + (entry.reasoningTokens ?? 0) + (entry.textTokens ?? 0);
  if (derived > 0) {
    return derived;
  }

  return typeof entry.effectiveCompletionTokenLimit === "number" ? 0 : null;
}

export function noteSummary(entry: RequestCatalogRow): string {
  return entry.error || "";
}

export function routingMiddlewareLabel(entry: RequestCatalogRow): string {
  return entry.routingMiddlewareId || "-";
}

export function routingProfileLabel(entry: RequestCatalogRow): string {
  return entry.routingMiddlewareProfile || "-";
}

export function routingTitle(entry: RequestCatalogRow): string {
  if (!entry.routingMiddlewareId && !entry.routingMiddlewareProfile) {
    return "No AI request routing middleware was used for this request.";
  }

  return "AI request middleware selection and routing outcome returned before llmproxy resolved the final model.";
}

export function tokenCountSummary(entry: RequestCatalogRow): string {
  const tokenCount = entryTokenCount(entry);

  if (tokenCount === null) {
    return "-";
  }

  const usedLabel = new Intl.NumberFormat("en-US").format(tokenCount);
  return `${usedLabel} tok`;
}

export function maxTokensSummary(entry: RequestCatalogRow): string {
  if (typeof entry.effectiveCompletionTokenLimit === "number") {
    return `${new Intl.NumberFormat("en-US").format(entry.effectiveCompletionTokenLimit)} tok`;
  }

  return "\u221E";
}

export function tokenRateSummary(entry: RequestCatalogRow): string {
  return formatTokenRate(entry.completionTokensPerSecond) || "-";
}

export function energyUsageSummary(entry: RequestCatalogRow): string {
  return formatEnergyUsageWh(entry.energyUsageWh) || "-";
}

export function formatLogDate(value: string): string {
  try {
    return logDateFormatter.format(new Date(value));
  } catch {
    return formatDate(value);
  }
}

export function formatLogTime(value: string): string {
  try {
    return logTimeFormatter.format(new Date(value));
  } catch {
    return "";
  }
}
