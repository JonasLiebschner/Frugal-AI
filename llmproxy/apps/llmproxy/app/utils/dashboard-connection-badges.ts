import type { ActiveConnectionSnapshot, UiBadge } from "../types/dashboard";
import { badgeSpec, describeFinishReason } from "./dashboard-badges";
import { formatDuration, formatTokenRate } from "./formatters";

export function buildConnectionTransportBadges(
  connection: ActiveConnectionSnapshot,
  options?: { invertDirections?: boolean },
): UiBadge[] {
  const queueDurationMs =
    connection.phase === "queued" ? connection.elapsedMs : connection.queueMs;
  const showQueueDuration =
    connection.phase === "queued" || connection.queueMs > 0;
  const invertDirections = Boolean(options?.invertDirections);
  const downstreamArrow = invertDirections ? "\u2193" : "\u2191";
  const upstreamArrow = invertDirections ? "\u2191" : "\u2193";
  const tokenRate = formatTokenRate(connection.completionTokensPerSecond);
  const liveCompletionTokens = typeof connection.completionTokens === "number"
    ? connection.completionTokens
    : connection.contentTokens + connection.reasoningTokens + connection.textTokens;
  const completionTokenLimitLabel =
    typeof connection.effectiveCompletionTokenLimit === "number"
      ? new Intl.NumberFormat("en-US").format(connection.effectiveCompletionTokenLimit)
      : "\u221E";
  const tokenCountLabel = liveCompletionTokens > 0
    ? `${new Intl.NumberFormat("en-US").format(liveCompletionTokens)} / ${completionTokenLimitLabel} tok`
    : "";
  const timeToFirstToken = typeof connection.timeToFirstTokenMs === "number"
    ? formatDuration(connection.timeToFirstTokenMs)
    : "";
  const generationDuration = typeof connection.generationMs === "number"
    ? formatDuration(connection.generationMs)
    : "";
  const downstreamTokenRate = connection.clientStream && tokenRate ? tokenRate : "";
  const upstreamTokenRate = connection.upstreamStream && tokenRate ? tokenRate : "";
  const downstreamLabel = [
    connection.clientStream ? `${downstreamArrow} stream` : `${downstreamArrow} json`,
    ...(showQueueDuration ? [formatDuration(queueDurationMs)] : []),
    formatDuration(connection.elapsedMs),
    ...(downstreamTokenRate ? (tokenCountLabel ? [tokenCountLabel] : []) : []),
    ...(downstreamTokenRate ? [tokenRate] : []),
  ].join(" \u00b7 ");
  const elapsedDetail = ` Total downstream lifetime so far: ${formatDuration(connection.elapsedMs)}.`;
  const queueDetail =
    connection.phase === "queued"
      ? ` First time value: queued for ${formatDuration(queueDurationMs)} so far while waiting for a backend slot.`
      : connection.queueMs > 0
        ? ` First time value: waited ${formatDuration(connection.queueMs)} in queue before a backend was assigned.`
        : "";
  const tokenCountDetail = tokenCountLabel
    ? ` Current generated completion tokens: ${new Intl.NumberFormat("en-US").format(liveCompletionTokens)} of ${completionTokenLimitLabel}.`
    : "";
  const tokenRateDetail = tokenRate
    ? ` Current generation speed: ${tokenRate}.`
    : "";
  const downstreamTone =
    connection.phase === "streaming" && connection.clientStream
      ? "good"
      : "warn";
  const downstreamTitle =
    connection.phase === "queued"
      ? `The client is still waiting because this request has not been assigned to a backend yet.${elapsedDetail}${queueDetail}${tokenCountDetail}${tokenRateDetail}`
      : connection.phase === "connected"
        ? `A backend is assigned, but the client is still waiting for the response to begin.${elapsedDetail}${queueDetail}${tokenCountDetail}${tokenRateDetail}`
        : connection.clientStream
          ? `The client is receiving streamed tokens or chunks from llmproxy right now.${elapsedDetail}${queueDetail}${tokenCountDetail}${tokenRateDetail}`
          : `The backend is generating, but llmproxy is buffering the response before returning JSON to the client.${elapsedDetail}${queueDetail}${tokenCountDetail}${tokenRateDetail}`;
  const upstreamTone =
    connection.statusCode === undefined
      ? "neutral"
      : connection.statusCode === 200
        ? "good"
        : "bad";
  const upstreamTitle =
    connection.statusCode === undefined
      ? "Upstream request mode from llmproxy to the backend."
      : `Upstream request mode from llmproxy to the backend. Current upstream status: HTTP ${connection.statusCode}.${timeToFirstToken ? ` First time value: time to first upstream token ${timeToFirstToken}.` : ""}${generationDuration ? ` Second time value: upstream generation phase lasted ${generationDuration}.` : ""}${tokenCountDetail}${upstreamTokenRate ? ` Current upstream generation speed: ${upstreamTokenRate}.` : ""}`;

  return [
    badgeSpec(
      downstreamLabel,
      downstreamTone,
      downstreamTitle,
    ),
    badgeSpec(
      [
        connection.upstreamStream ? `${upstreamArrow} stream` : `${upstreamArrow} json`,
        ...(timeToFirstToken ? [timeToFirstToken] : []),
        ...(generationDuration ? [generationDuration] : []),
        ...(upstreamTokenRate ? (tokenCountLabel ? [tokenCountLabel] : []) : []),
        ...(upstreamTokenRate ? [upstreamTokenRate] : []),
      ].join(" \u00b7 "),
      upstreamTone,
      upstreamTitle,
    ),
  ];
}

export function buildConnectionCardBadges(connection: ActiveConnectionSnapshot): UiBadge[] {
  const items: UiBadge[] = [];

  if (connection.finishReason) {
    items.push(badgeSpec(`finish ${connection.finishReason}`, "good", describeFinishReason(connection.finishReason)));
  }

  return items;
}

export function buildConnectionMetricBadges(connection: ActiveConnectionSnapshot): UiBadge[] {
  void connection;
  return [];
}
