import { type H3Event } from "h3";
import type { LiveRequestState } from "../ai-proxy-types";
import type {
  BackendLease,
} from "../../../shared/type-api";
import type { AiClientLoadBalancer } from "../../../ai-client/server/ai-client-capability";
import {
  beginTrackedProxyRoute,
  prepareProxyRouteRuntime,
} from "./proxy-route-runtime";
import { handleProxyUpstreamResponse } from "./proxy-route-response";
import {
  fetchProxyUpstreamResponse,
  getProxyUpstreamTimeoutMs,
  prepareProxyUpstreamRequest,
} from "./proxy-route-upstream";
import { handleProxyStreamingUpstreamResponse } from "./proxy-route-streaming";
import { isErrorStatus } from "./proxy-error-utils";
import {
  createProxyRouteAbortHandle,
  registerProxyClientDisconnectHandler,
} from "./proxy-route-cancellation";
import { handleProxyOllamaUpstreamError } from "./proxy-route-error";
import { handleProxyRouteFailure } from "./proxy-route-failure";

export interface ProxyRouteOperationsContext {
  loadBalancer: AiClientLoadBalancer;
  requestState: LiveRequestState;
}

export function isSupportedProxyPath(pathname: string): boolean {
  return pathname === "/v1/chat/completions";
}

export function isSupportedProxyRoute(method: string, pathname: string): boolean {
  if (method !== "POST") {
    return false;
  }

  return isSupportedProxyPath(pathname);
}

export async function handleProxyRoute(
  context: ProxyRouteOperationsContext,
  event: H3Event,
): Promise<Record<string, unknown> | Uint8Array | Buffer | string | void> {
  const { loadBalancer, requestState } = context;
  const clientDisconnectSignal = event.context.clientDisconnectSignal;
  const {
    request,
    url,
    method,
    body,
    parsedBody,
    route,
    streamingKind,
    upstreamStream,
  } = await prepareProxyRouteRuntime({
    event,
    requestState,
    loadBalancer,
  });
  let responseStarted = false;
  let responseFinished = false;
  const { abortController, abortRequest, cancelActiveRequest } = createProxyRouteAbortHandle({
    requestState,
    requestId: route.id,
  });
  const unregisterClientDisconnect = registerProxyClientDisconnectHandler({
    clientDisconnectSignal,
    isResponseFinished: () => responseFinished,
    abortRequest,
  });

  beginTrackedProxyRoute({
    event,
    route,
    kind: streamingKind ?? "other",
    upstreamStream,
    requestState,
    cancel: cancelActiveRequest,
  });

  let lease: BackendLease | undefined;
  let timeout: NodeJS.Timeout | undefined;

  try {
    const preparedUpstream = await prepareProxyUpstreamRequest({
      loadBalancer,
      requestState,
      route,
      signal: abortController.signal,
      method,
      pathname: url.pathname,
      search: url.search,
      body,
      parsedBody,
      streamingKind,
    });
    lease = preparedUpstream.lease;
    const { routedModel, requestPlan } = preparedUpstream;
    const timeoutMs = getProxyUpstreamTimeoutMs(loadBalancer, lease);
    timeout = setTimeout(() => {
      abortRequest(`Upstream timeout after ${timeoutMs}ms.`, "timeout");
    }, timeoutMs);

    const upstreamResponse = await fetchProxyUpstreamResponse({
      request,
      route,
      requestState,
      lease,
      requestPlan,
      protocol: url.protocol.replace(/:$/, ""),
      signal: abortController.signal,
    });

    const ollamaErrorResponse = await handleProxyOllamaUpstreamError({
      event,
      requestState,
      lease,
      route,
      upstreamResponse,
      responseMode: requestPlan.responseMode,
    });
    if (ollamaErrorResponse.handled) {
      responseStarted = true;
      responseFinished = true;
      return ollamaErrorResponse.body;
    }

    const upstreamOutcome = isErrorStatus(upstreamResponse.status) ? "error" : "success";

    const streamingResponse = await handleProxyStreamingUpstreamResponse({
      event,
      requestState,
      route,
      lease,
      receivedAt: route.receivedAt,
      routedModel,
      upstreamResponse,
      upstreamOutcome,
      responseMode: requestPlan.responseMode,
      streamingKind,
      onResponseStart(started) {
        responseStarted = started;
      },
    });
    if (streamingResponse.handled) {
      responseStarted = true;
      responseFinished = true;
      return streamingResponse.body;
    }

    responseStarted = true;
    const upstreamResponseBody = await handleProxyUpstreamResponse({
      event,
      requestState,
      lease,
      requestId: route.id,
      receivedAt: route.receivedAt,
      routedModel,
      routingMiddlewareId: lease.routingMiddlewareId,
      routingMiddlewareProfile: lease.routingMiddlewareProfile,
      upstreamResponse,
      upstreamOutcome,
    });
    responseFinished = true;
    return upstreamResponseBody;
  } catch (error) {
    const failure = handleProxyRouteFailure({
      event,
      requestState,
      route,
      lease,
      error,
      abortSignal: abortController.signal,
      clientDisconnectSignal,
      responseStarted,
      responseFinished,
    });
    responseStarted = failure.responseStarted;
    responseFinished = failure.responseFinished;
    if (failure.body) {
      return failure.body;
    }
  } finally {
    unregisterClientDisconnect();

    if (timeout) {
      clearTimeout(timeout);
    }

    requestState.removeConnection(route.id);
  }
}
