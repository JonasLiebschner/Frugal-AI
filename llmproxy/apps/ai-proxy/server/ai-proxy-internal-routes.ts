export const aiProxyInternalRequestsPath = "/api/ai-proxy/internal/requests";
export const aiProxyInternalRequestDiagnosticsPath = "/api/ai-proxy/internal/diagnostics/requests";
export const aiProxyInternalRequestRoutePattern = `${aiProxyInternalRequestsPath}/:id`;
export const aiProxyInternalRequestDiagnosticsRoutePattern = `${aiProxyInternalRequestDiagnosticsPath}/:id`;

export interface AiProxyInternalRequestListPathOptions {
  limit?: number;
  includeLive?: boolean;
  onlyWithDetail?: boolean;
}

export function buildAiProxyInternalRequestPath(requestId: string): string {
  return `${aiProxyInternalRequestsPath}/${encodeURIComponent(requestId)}`;
}

export function buildAiProxyInternalRequestDiagnosticsPath(requestId: string): string {
  return `${aiProxyInternalRequestDiagnosticsPath}/${encodeURIComponent(requestId)}`;
}

export function buildAiProxyInternalRequestListPath(
  options: AiProxyInternalRequestListPathOptions = {},
): string {
  const query = new URLSearchParams();

  if (options.limit !== undefined) {
    query.set("limit", String(options.limit));
  }

  if (options.includeLive !== undefined) {
    query.set("include_live", options.includeLive ? "true" : "false");
  }

  if (options.onlyWithDetail !== undefined) {
    query.set("only_with_detail", options.onlyWithDetail ? "true" : "false");
  }

  const queryString = query.toString();
  return queryString.length > 0
    ? `${aiProxyInternalRequestsPath}?${queryString}`
    : aiProxyInternalRequestsPath;
}
