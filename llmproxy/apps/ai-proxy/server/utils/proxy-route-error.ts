import { setResponseStatus, type H3Event } from "h3";
import { readOllamaErrorMessage } from "./proxy-upstream-http";
import { proxyError } from "./proxy-error-utils";
import {
  applyProxyRouteResponseHeaders,
  releaseProxyLease,
} from "./proxy-route-outcome";
import type { LiveRequestState } from "../ai-proxy-types";
import type { BackendLease, ProxyRouteRequest } from "../../../shared/type-api";

interface HandleProxyOllamaUpstreamErrorOptions {
  event: H3Event;
  requestState: LiveRequestState;
  lease: BackendLease;
  route: ProxyRouteRequest;
  upstreamResponse: Response;
  responseMode: "raw" | "openai-sse" | "ollama-ndjson";
}

type ProxyErrorRouteResult =
  | {
      handled: false;
    }
  | {
      handled: true;
      body: ReturnType<typeof proxyError>;
    };

export async function handleProxyOllamaUpstreamError(
  options: HandleProxyOllamaUpstreamErrorOptions,
): Promise<ProxyErrorRouteResult> {
  const {
    event,
    requestState,
    lease,
    route,
    upstreamResponse,
    responseMode,
  } = options;

  if (responseMode !== "ollama-ndjson" || upstreamResponse.ok) {
    return { handled: false };
  }

  const errorMessage = await readOllamaErrorMessage(upstreamResponse);
  requestState.updateConnection(route.id, { error: errorMessage }, true);
  setResponseStatus(event, upstreamResponse.status);
  applyProxyRouteResponseHeaders({
    event,
    requestId: route.id,
    backendId: lease.backend.id,
    model: lease.selectedModel ?? route.model,
    routingMiddlewareId: lease.routingMiddlewareId,
    routingMiddlewareProfile: lease.routingMiddlewareProfile,
    statusCode: upstreamResponse.status,
  });
  releaseProxyLease({
    lease,
    requestState,
    requestId: route.id,
    receivedAt: route.receivedAt,
    outcome: "error",
    statusCode: upstreamResponse.status,
    error: errorMessage,
  });

  return {
    handled: true,
    body: proxyError(errorMessage, "upstream_error"),
  };
}
