import type { BackendSnapshot, RequestFieldRow, RequestLogEntry, UiBadge } from "../types/dashboard";
import { formatDuration, formatEnergyUsageWh, formatTokenRate } from "./formatters";
import { badgeSpec, describeFinishReason } from "./dashboard-badges";
import { buildCompletionMetricValue, resolveServedModelName } from "./dashboard-request-completion";

export function buildRecentRequestMetrics(entry: RequestLogEntry): UiBadge[] {
  const items: UiBadge[] = [];

  if (typeof entry.promptTokens === "number") {
    items.push(badgeSpec(`prompt ${entry.promptTokens}`, "neutral", "Prompt tokens reported or inferred for this request."));
  }

  if (typeof entry.completionTokens === "number") {
    items.push(badgeSpec(`completion ${entry.completionTokens}`, "neutral", "Completion tokens reported or inferred for this request."));
  }

  if (typeof entry.totalTokens === "number") {
    items.push(badgeSpec(`total ${entry.totalTokens}`, "neutral", "Total tokens reported or inferred for this request."));
  }

  if (typeof entry.contentTokens === "number" && entry.contentTokens > 0) {
    items.push(badgeSpec(`content ${entry.contentTokens}`, "neutral", "Completion tokens attributed to normal visible content."));
  }

  if (typeof entry.reasoningTokens === "number" && entry.reasoningTokens > 0) {
    items.push(badgeSpec(`reasoning ${entry.reasoningTokens}`, "neutral", "Completion tokens attributed to reasoning content."));
  }

  if (typeof entry.textTokens === "number" && entry.textTokens > 0) {
    items.push(badgeSpec(`text ${entry.textTokens}`, "neutral", "Completion tokens attributed to text-completion style output."));
  }

  if (typeof entry.timeToFirstTokenMs === "number") {
    items.push(badgeSpec(`ttfb ${formatDuration(entry.timeToFirstTokenMs)}`, "neutral", "Time to first generated token."));
  }

  if (typeof entry.generationMs === "number") {
    items.push(badgeSpec(`gen ${formatDuration(entry.generationMs)}`, "neutral", "Generation phase duration."));
  }

  const tokenRate = formatTokenRate(entry.completionTokensPerSecond);
  if (tokenRate) {
    items.push(badgeSpec(tokenRate, "good", "Completion tokens generated per second."));
  }

  return items;
}

export function buildRequestResponseMetricRows(
  entry?: RequestLogEntry,
  options?: {
    requestBody?: unknown;
    responseBody?: unknown;
    backends?: BackendSnapshot[];
    live?: boolean;
  },
): RequestFieldRow[] {
  if (!entry) {
    return [];
  }

  const items: RequestFieldRow[] = [];
  const servedModel = resolveServedModelName(options?.responseBody, options?.requestBody, entry.model);
  const backendLabel = entry.backendName?.trim() || entry.backendId?.trim() || "";
  const statusCodeBadge = typeof entry.statusCode === "number"
    ? badgeSpec(
      `HTTP ${entry.statusCode}`,
      entry.statusCode >= 200 && entry.statusCode < 300 ? "good" : "bad",
      `Final upstream HTTP status code: ${entry.statusCode}.`,
    )
    : null;

  if (backendLabel) {
    items.push({
      key: "Backend",
      value: backendLabel,
      title: "Backend instance that actually served and answered this request.",
    });
  }

  if (servedModel) {
    items.push({
      key: "Model",
      value: servedModel,
      title: "Concrete model that actually produced the response after llmproxy routing resolved the request.",
    });
  }

  if (entry.routingMiddlewareId) {
    items.push({
      key: "Routing middleware",
      value: entry.routingMiddlewareId,
      title: "Middleware that was explicitly selected through the middleware:<id> model selector for this request.",
    });
  }

  if (entry.routingMiddlewareProfile) {
    items.push({
      key: "Routing outcome",
      value: entry.routingMiddlewareProfile,
      title: "Routing outcome returned by the selected AI request middleware before llmproxy resolved the final connection. This can be a classification or a direct routed model.",
    });
  }

  items.push({
    key: "Status",
    value: describeRequestStatus(entry),
    title: "Final request status recorded by llmproxy for this request.",
  });

  if (typeof entry.timeToFirstTokenMs === "number") {
    items.push({
      key: "Time to first token",
      value: formatDuration(entry.timeToFirstTokenMs),
      title: "How long it took from request start until the first completion token arrived from the backend.",
    });
  }

  if (typeof entry.generationMs === "number") {
    items.push({
      key: "Generation time",
      value: formatDuration(entry.generationMs),
      title: "How long the backend spent in the actual generation phase after output started.",
    });
  }

  if (typeof entry.energyUsageWh === "number") {
    items.push({
      key: "Energy usage",
      value: formatEnergyUsageWh(entry.energyUsageWh),
      title: "Estimated request energy usage in watt-hours, based on backend power samples collected while this request was active.",
    });
  }

  if (typeof entry.reasoningTokens === "number" && entry.reasoningTokens > 0) {
    items.push({
      key: "Reasoning tokens",
      value: `${entry.reasoningTokens} tokens`,
      title: "Generated tokens attributed to hidden reasoning or thinking content, when the backend reports them separately.",
    });
  }

  if (typeof entry.contentTokens === "number" && entry.contentTokens > 0) {
    items.push({
      key: "Content tokens",
      value: `${entry.contentTokens} tokens`,
      title: "Generated tokens that became normal visible assistant output in the final response.",
    });
  }

  const completionMetric = buildCompletionMetricValue(entry, options, servedModel);
  if (completionMetric) {
    items.push({
      key: "Completion tokens",
      value: completionMetric.value,
      title: completionMetric.title,
    });
  }

  const tokenRate = formatTokenRate(entry.completionTokensPerSecond);
  if (tokenRate) {
    items.push({
      key: "Completion throughput",
      value: tokenRate.replace("tok/s", "tokens/s"),
      title: "Average completion-token throughput during the generation phase.",
    });
  }

  if (typeof entry.textTokens === "number" && entry.textTokens > 0) {
    items.push({
      key: "Text-completion tokens",
      value: `${entry.textTokens} tokens`,
      title: "Generated tokens counted from text-completion style output when the backend reports them separately.",
    });
  }

  if (entry.finishReason || statusCodeBadge) {
    const finishReasonTitle = entry.finishReason
      ? describeFinishReason(entry.finishReason)
      : "The backend did not report a finish reason for this request.";
    items.push({
      key: "Finish reason",
      value: entry.finishReason || "-",
      title: statusCodeBadge ? `${finishReasonTitle} Final upstream HTTP status: ${entry.statusCode}.` : finishReasonTitle,
      ...(statusCodeBadge ? { valueBadges: [statusCodeBadge] } : {}),
    });
  }

  return items;
}

function describeRequestStatus(entry: RequestLogEntry): string {
  if (entry.outcome === "success") {
    return "success";
  }

  if (entry.outcome === "queued_timeout") {
    return "queue timeout";
  }

  return entry.outcome;
}
