import { setResponseHeader, setResponseStatus, type H3Event } from "h3";
import type {
  BackendLease,
  JsonValue,
  LeaseReleaseResult,
} from "../../../shared/type-api";
import type { ActiveConnectionRuntime, LiveRequestState } from "../ai-proxy-types";
import { buildProxyRouteResponseHeaders } from "./proxy-route-response-headers";

interface ReleaseProxyLeaseOptions {
  lease: BackendLease;
  requestState: Pick<LiveRequestState, "buildReleaseMetrics">;
  requestId: string;
  receivedAt: number;
  outcome: LeaseReleaseResult["outcome"];
  statusCode?: number;
  error?: string;
  responseBody?: JsonValue;
}

interface ApplyProxyRouteResponseHeadersOptions {
  event: H3Event;
  requestId: string;
  backendId: string;
  model?: string;
  routingMiddlewareId?: string;
  routingMiddlewareProfile?: string;
  statusCode?: number;
}

export function releaseProxyLease(options: ReleaseProxyLeaseOptions): void {
  const {
    lease,
    requestState,
    requestId,
    receivedAt,
    outcome,
    statusCode,
    error,
    responseBody,
  } = options;

  const result: LeaseReleaseResult = {
    outcome,
    latencyMs: Date.now() - receivedAt,
    queuedMs: lease.queueMs,
    ...requestState.buildReleaseMetrics(requestId),
  };

  if (typeof statusCode === "number") {
    result.statusCode = statusCode;
  }

  if (typeof error === "string") {
    result.error = error;
  }

  if (typeof responseBody !== "undefined") {
    result.responseBody = responseBody;
  }

  lease.release(result);
}

export function applyProxyRouteResponseHeaders(
  options: ApplyProxyRouteResponseHeadersOptions,
): void {
  const {
    event,
    requestId,
    backendId,
    model,
    routingMiddlewareId,
    routingMiddlewareProfile,
    statusCode,
  } = options;
  if (typeof statusCode === "number") {
    setResponseStatus(event, statusCode);
  }

  const headers = buildProxyRouteResponseHeaders({
    requestId,
    backendId,
    model,
    routingMiddlewareId,
    routingMiddlewareProfile,
  });

  for (const [name, value] of Object.entries(headers)) {
    setResponseHeader(event, name, value);
  }
}

export function isCancelledProxyConnection(
  connection: Pick<ActiveConnectionRuntime, "cancelSource"> | undefined,
): boolean {
  return connection?.cancelSource === "dashboard" || connection?.cancelSource === "client_disconnect";
}
