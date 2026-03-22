import { setResponseStatus, type H3Event } from "h3";
import { toErrorMessage } from "../../../shared/server/core-utils";
import type { BackendLease, ProxyRouteRequest } from "../../../shared/type-api";
import type { LiveRequestState } from "../ai-proxy-types";
import { destroyClientResponse } from "./client-disconnect";
import {
  proxyError,
  selectProxyStatus,
} from "./proxy-error-utils";
import {
  applyProxyRouteResponseHeaders,
  isCancelledProxyConnection,
  releaseProxyLease,
} from "./proxy-route-outcome";

interface HandleProxyRouteFailureOptions {
  event: H3Event;
  requestState: Pick<LiveRequestState, "buildReleaseMetrics" | "getActiveConnection" | "updateConnection">;
  route: ProxyRouteRequest;
  lease?: BackendLease;
  error: unknown;
  abortSignal: AbortSignal;
  clientDisconnectSignal: AbortSignal;
  responseStarted: boolean;
  responseFinished: boolean;
}

export interface ProxyRouteFailureResult {
  responseStarted: boolean;
  responseFinished: boolean;
  body?: ReturnType<typeof proxyError>;
}

export function handleProxyRouteFailure(
  options: HandleProxyRouteFailureOptions,
): ProxyRouteFailureResult {
  const {
    event,
    requestState,
    route,
    lease,
    error,
    abortSignal,
    clientDisconnectSignal,
    responseStarted,
    responseFinished,
  } = options;

  const message = toErrorMessage(error);
  const connection = requestState.getActiveConnection(route.id);
  const wasCancelled = isCancelledProxyConnection(connection);
  const statusCode = selectProxyStatus(
    message,
    abortSignal.aborted,
    clientDisconnectSignal.aborted,
    wasCancelled,
  );

  if (lease) {
    requestState.updateConnection(route.id, { error: message }, true);
    if (!responseStarted) {
      applyProxyRouteResponseHeaders({
        event,
        requestId: route.id,
        backendId: lease.backend.id,
        model: lease.selectedModel ?? route.model,
        routingMiddlewareId: lease.routingMiddlewareId,
        routingMiddlewareProfile: lease.routingMiddlewareProfile,
        statusCode,
      });
    }
    releaseProxyLease({
      lease,
      requestState,
      requestId: route.id,
      receivedAt: route.receivedAt,
      outcome: wasCancelled ? "cancelled" : "error",
      error: message,
    });
  }

  if (!responseStarted) {
    setResponseStatus(event, statusCode);
    return {
      responseStarted: true,
      responseFinished: true,
      body: proxyError(message),
    };
  }

  if (!responseFinished) {
    destroyClientResponse(event, error instanceof Error ? error : undefined);
  }

  return {
    responseStarted,
    responseFinished,
  };
}
