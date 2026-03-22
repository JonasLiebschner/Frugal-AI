export interface ProxyRouteResponseHeaderOptions {
  requestId: string;
  backendId: string;
  model?: string;
  routingMiddlewareId?: string;
  routingMiddlewareProfile?: string;
}

export function buildProxyRouteResponseHeaders(
  options: ProxyRouteResponseHeaderOptions,
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-ai-proxy-request-id": options.requestId,
    "x-ai-proxy-backend": options.backendId,
  };

  if (options.model) {
    headers["x-ai-proxy-model"] = options.model;
  }

  if (options.routingMiddlewareId) {
    headers["x-ai-proxy-routing-middleware"] = options.routingMiddlewareId;
  }

  if (options.routingMiddlewareProfile) {
    headers["x-ai-proxy-routing-outcome"] = options.routingMiddlewareProfile;
  }

  return headers;
}
