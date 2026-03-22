import { defineEventHandler, getQuery } from "h3";
import type { ProxySnapshot } from "../../../../../../shared/type-api";
import { requireAiProxyCapability } from "../../../../ai-proxy-capability";

export default defineEventHandler(async (event) => buildInternalRequestListPayload(
  (await requireAiProxyCapability(event)).requestState.getSnapshot(),
  parseInternalRequestListOptions(getQuery(event)),
));

function parseInternalRequestListOptions(
  input: Record<string, unknown>,
): InternalRequestListOptions {
  return {
    limit: coerceInteger(input.limit, 20, 1, 100),
    includeLive: coerceBoolean(input.include_live, true),
    onlyWithDetail: coerceBoolean(input.only_with_detail, true),
  };
}

function buildInternalRequestListPayload(
  snapshot: ProxySnapshot,
  options: InternalRequestListOptions,
): { requests: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];

  if (options.includeLive) {
    for (const connection of snapshot.activeConnections) {
      if (options.onlyWithDetail && !connection.hasDetail) {
        continue;
      }

      rows.push({
        id: connection.id,
        time: connection.startedAt,
        live: true,
        status: connection.phase,
        method: connection.method,
        path: connection.path,
        model: connection.model,
        backend: connection.backendName,
        finish_reason: connection.finishReason,
        has_detail: Boolean(connection.hasDetail),
      });
    }
  }

  for (const entry of snapshot.recentRequests) {
    if (options.onlyWithDetail && !entry.hasDetail) {
      continue;
    }

    if (rows.some((row) => row.id === entry.id)) {
      continue;
    }

    rows.push({
      id: entry.id,
      time: entry.time,
      live: false,
      status: entry.outcome,
      method: entry.method,
      path: entry.path,
      model: entry.model,
      backend: entry.backendName,
      finish_reason: entry.finishReason,
      has_detail: Boolean(entry.hasDetail),
    });
  }

  return {
    requests: rows
      .sort((left, right) => String(right.time).localeCompare(String(left.time)))
      .slice(0, options.limit),
  };
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }

  return fallback;
}

function coerceInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return Math.min(max, Math.max(min, parsed));
    }
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

interface InternalRequestListOptions {
  limit: number;
  includeLive: boolean;
  onlyWithDetail: boolean;
}
