import {
  buildBackendRequestPlan,
} from "../../../ai-client/server/ai-client-capability";
import type { AiClientLoadBalancer } from "../../../ai-client/server/ai-client-capability";
import type { BackendLease, JsonValue, ProxyRouteRequest } from "../../../shared/type-api";
import type { LiveRequestState } from "../ai-proxy-types";
import { joinUrl } from "../../../shared/server/network-utils";
import { buildUpstreamHeaders } from "./proxy-upstream-http";

interface PrepareProxyUpstreamRequestOptions {
  loadBalancer: AiClientLoadBalancer;
  requestState: LiveRequestState;
  route: ProxyRouteRequest;
  signal: AbortSignal;
  method: string;
  pathname: string;
  search: string;
  body: Buffer;
  parsedBody?: Record<string, unknown>;
  streamingKind?: string;
}

interface FetchProxyUpstreamResponseOptions {
  request: Request;
  route: ProxyRouteRequest;
  requestState: LiveRequestState;
  lease: BackendLease;
  requestPlan: ReturnType<typeof buildBackendRequestPlan>;
  protocol: string;
  signal: AbortSignal;
}

export function getProxyUpstreamTimeoutMs(
  loadBalancer: Pick<AiClientLoadBalancer, "getAiClientSettings">,
  lease: BackendLease,
): number {
  return lease.backend.timeoutMs ?? loadBalancer.getAiClientSettings().requestTimeoutMs;
}

function applySelectedModel(
  parsedBody: Record<string, unknown> | undefined,
  selectedModel?: string,
): Record<string, unknown> | undefined {
  if (!parsedBody || !selectedModel) {
    return parsedBody;
  }

  return {
    ...parsedBody,
    model: selectedModel,
  };
}

export async function prepareProxyUpstreamRequest(
  options: PrepareProxyUpstreamRequestOptions,
): Promise<{
  lease: BackendLease;
  routedModel?: string;
  requestPlan: ReturnType<typeof buildBackendRequestPlan>;
}> {
  const {
    loadBalancer,
    requestState,
    route,
    signal,
    method,
    pathname,
    search,
    body,
    parsedBody,
    streamingKind,
  } = options;

  const lease = await loadBalancer.acquire(route, signal);
  const routedModel = lease.selectedModel ?? route.model;
  requestState.updateConnection(route.id, {
    phase: "connected",
    backendId: lease.backend.id,
    backendName: lease.backend.name,
    model: routedModel,
    routingMiddlewareId: lease.routingMiddlewareId,
    routingMiddlewareProfile: lease.routingMiddlewareProfile,
    queueMs: lease.queueMs,
  }, true);
  requestState.startConnectionEnergyTracking(route.id, lease.backend);

  const upstreamParsedBody = applySelectedModel(parsedBody, lease.selectedModel);
  const requestPlan = buildBackendRequestPlan(
    lease.backend,
    method,
    pathname,
    search,
    body,
    upstreamParsedBody,
    Boolean(streamingKind),
  );

  return {
    lease,
    routedModel,
    requestPlan,
  };
}

export async function fetchProxyUpstreamResponse(
  options: FetchProxyUpstreamResponseOptions,
): Promise<Response> {
  const {
    request,
    route,
    requestState,
    lease,
    requestPlan,
    protocol,
    signal,
  } = options;

  const upstreamResponse = await fetch(joinUrl(lease.backend.baseUrl, requestPlan.pathAndSearch), {
    method: request.method,
    headers: buildUpstreamHeaders(
      request.headers,
      lease,
      route.clientIp,
      protocol,
    ),
    body: requestPlan.body ? new Uint8Array(requestPlan.body) : undefined,
    redirect: "manual",
    signal,
  });

  requestState.updateConnection(route.id, { statusCode: upstreamResponse.status }, true);
  return upstreamResponse;
}
