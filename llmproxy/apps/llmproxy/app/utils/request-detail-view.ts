import type { ActiveConnectionSnapshot, RequestLogDetail } from "../types/dashboard";
import { formatClientIp } from "./client-ip";
import { formatDate, shortId } from "./formatters";

export function buildRequestDetailTitle(detail?: RequestLogDetail | null): string {
  const entry = detail?.entry;
  return entry ? `${entry.method} ${entry.path}` : "Request Details";
}

export function buildRequestDetailSubtitle(detail?: RequestLogDetail | null): string {
  const entry = detail?.entry;

  if (!entry) {
    return "Inspect the original request payload, messages, tools, and final response.";
  }

  return [
    formatDate(entry.time),
    formatClientIp(entry.clientIp) ? `IP ${formatClientIp(entry.clientIp)}` : "",
    detail?.live ? "" : `req ${shortId(entry.id)}`,
    entry.model ? `model ${entry.model}` : "",
    entry.backendName ? `backend ${entry.backendName}` : "",
  ].filter(Boolean).join(" \u00b7 ");
}

export function resolveRequestLiveConnection(
  activeConnections: ActiveConnectionSnapshot[],
  requestId: string,
  live: boolean,
): ActiveConnectionSnapshot | null {
  if (!live || !requestId) {
    return null;
  }

  return activeConnections.find((connection) => connection.id === requestId) ?? null;
}
