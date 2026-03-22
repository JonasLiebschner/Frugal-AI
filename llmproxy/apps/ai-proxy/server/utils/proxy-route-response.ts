import type { H3Event } from "h3";
import { compactJsonForRetention } from "../../../shared/server/retained-json";
import type { BackendLease, JsonValue } from "../../../shared/type-api";
import { buildCompletedResponseConnectionPatch } from "../ai-proxy-live-requests";
import type { LiveRequestState } from "../ai-proxy-types";
import {
  buildClientUpstreamErrorBuffer,
  parseRetainedUpstreamResponseBody,
} from "./proxy-upstream-http";
import {
  extractErrorMessageFromPayload,
  sanitizeUpstreamErrorPayloadForClient,
} from "./proxy-error-utils";
import { copyResponseHeaders } from "./h3-response-headers";
import {
  applyProxyRouteResponseHeaders,
  releaseProxyLease,
} from "./proxy-route-outcome";

interface HandleProxyUpstreamResponseOptions {
  event: H3Event;
  requestState: LiveRequestState;
  lease: BackendLease;
  requestId: string;
  receivedAt: number;
  routedModel?: string;
  routingMiddlewareId?: string;
  routingMiddlewareProfile?: string;
  upstreamResponse: Response;
  upstreamOutcome: "success" | "error";
}

export async function handleProxyUpstreamResponse(
  options: HandleProxyUpstreamResponseOptions,
): Promise<Buffer | string | void> {
  const {
    event,
    requestState,
    lease,
    requestId,
    receivedAt,
    routedModel,
    routingMiddlewareId,
    routingMiddlewareProfile,
    upstreamResponse,
    upstreamOutcome,
  } = options;

  copyResponseHeaders(upstreamResponse.headers, event);
  applyProxyRouteResponseHeaders({
    event,
    requestId,
    backendId: lease.backend.id,
    model: routedModel,
    routingMiddlewareId,
    routingMiddlewareProfile,
    statusCode: upstreamResponse.status,
  });

  if (!upstreamResponse.body) {
    const errorMessage = upstreamOutcome === "error"
      ? `Upstream backend returned HTTP ${upstreamResponse.status}.`
      : undefined;
    if (errorMessage) {
      requestState.updateConnection(requestId, { error: errorMessage }, true);
    }

    releaseProxyLease({
      lease,
      requestState,
      requestId,
      receivedAt,
      outcome: upstreamOutcome,
      statusCode: upstreamResponse.status,
      error: errorMessage,
    });
    return "";
  }

  if (upstreamOutcome === "error") {
    const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    const retainedResponseBody = parseRetainedUpstreamResponseBody(
      responseBuffer,
      upstreamResponse.headers.get("content-type"),
    );
    const clientResponseBody = sanitizeUpstreamErrorPayloadForClient(retainedResponseBody);
    const clientResponseBuffer = clientResponseBody === retainedResponseBody
      ? responseBuffer
      : buildClientUpstreamErrorBuffer(clientResponseBody, responseBuffer);
    const errorMessage =
      extractErrorMessageFromPayload(clientResponseBody ?? retainedResponseBody)
      ?? `Upstream backend returned HTTP ${upstreamResponse.status}.`;

    requestState.updateConnection(requestId, {
      error: errorMessage,
      responseBody: compactJsonForRetention(retainedResponseBody),
    }, true);

    releaseProxyLease({
      lease,
      requestState,
      requestId,
      receivedAt,
      outcome: upstreamOutcome,
      statusCode: upstreamResponse.status,
      error: errorMessage,
      responseBody: retainedResponseBody as JsonValue | undefined,
    });
    return clientResponseBuffer;
  }

  const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
  const retainedResponseBody = parseRetainedUpstreamResponseBody(
    responseBuffer,
    upstreamResponse.headers.get("content-type"),
  );
  requestState.updateConnection(
    requestId,
    buildCompletedResponseConnectionPatch(retainedResponseBody as JsonValue | undefined),
    true,
  );
  releaseProxyLease({
    lease,
    requestState,
    requestId,
    receivedAt,
    outcome: upstreamOutcome,
    statusCode: upstreamResponse.status,
    responseBody: retainedResponseBody as JsonValue | undefined,
  });
  return responseBuffer;
}
