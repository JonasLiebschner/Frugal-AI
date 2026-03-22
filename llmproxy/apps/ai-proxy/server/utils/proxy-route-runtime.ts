import { randomUUID } from "node:crypto";
import {
  getRequestIP,
  setResponseHeader,
  toWebRequest,
  type H3Event,
} from "h3";
import type { AiClientLoadBalancer } from "../../../ai-client/server/ai-client-capability";
import type {
  ActiveConnectionKind,
  JsonValue,
  ProxyRouteRequest,
} from "../../../shared/type-api";
import { extractClientIp, tryParseJsonBuffer } from "../../../shared/server/network-utils";
import type { ActiveConnectionRuntime, LiveRequestState } from "../ai-proxy-types";
import { detectStreamingKind } from "./streaming";

interface CreateProxyRouteRequestOptions {
  request: Request;
  path: string;
  receivedAt: number;
  contentType?: string;
  clientIp?: string;
  parsedBody?: Record<string, unknown>;
  requestState: LiveRequestState;
  loadBalancer: Pick<AiClientLoadBalancer, "getRequestLogDetail">;
}

interface BeginTrackedProxyRouteOptions {
  event: H3Event;
  route: ProxyRouteRequest;
  kind: ActiveConnectionKind;
  upstreamStream: boolean;
  requestState: LiveRequestState;
  cancel: ActiveConnectionRuntime["cancel"];
}

interface PrepareProxyRouteRuntimeOptions {
  event: H3Event;
  requestState: LiveRequestState;
  loadBalancer: Pick<AiClientLoadBalancer, "getRequestLogDetail">;
}

export interface PreparedProxyRouteRuntime {
  request: Request;
  url: URL;
  method: string;
  body: Buffer;
  parsedBody?: Record<string, unknown>;
  route: ProxyRouteRequest;
  streamingKind?: Exclude<ActiveConnectionKind, "other">;
  upstreamStream: boolean;
}

export async function prepareProxyRouteRuntime(
  options: PrepareProxyRouteRuntimeOptions,
): Promise<PreparedProxyRouteRuntime> {
  const { event, requestState, loadBalancer } = options;
  const request = toWebRequest(event);
  const url = new URL(request.url);
  const method = request.method;
  const receivedAt = Date.now();
  const body = Buffer.from(await request.arrayBuffer());
  const contentType = request.headers.get("content-type") ?? undefined;
  const parsedBody = tryParseJsonBuffer(body, contentType);
  const route = createProxyRouteRequest({
    request,
    path: `${url.pathname}${url.search}`,
    receivedAt,
    contentType,
    clientIp: getRequestIP(event, { xForwardedFor: true }) ?? extractClientIp({
      headers: request.headers,
    }),
    parsedBody,
    requestState,
    loadBalancer,
  });
  const streamingKind = detectStreamingKind(method, url.pathname, parsedBody);

  return {
    request,
    url,
    method,
    body,
    parsedBody,
    route,
    streamingKind,
    upstreamStream: streamingKind ? true : route.stream,
  };
}

function readRequestedProxyRequestId(headerValue: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof candidate !== "string") {
    return undefined;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return undefined;
  }

  return /^[A-Za-z0-9._:-]{1,128}$/.test(trimmed) ? trimmed : undefined;
}

export function createProxyRouteRequest(options: CreateProxyRouteRequestOptions): ProxyRouteRequest {
  const {
    request,
    path,
    receivedAt,
    contentType,
    clientIp,
    parsedBody,
    requestState,
    loadBalancer,
  } = options;
  const requestedRouteId = readRequestedProxyRequestId(
    request.headers.get("x-ai-proxy-request-id") ?? undefined,
  );
  const routeId = requestedRouteId
    && !requestState.hasActiveConnection(requestedRouteId)
    && !loadBalancer.getRequestLogDetail(requestedRouteId)
    ? requestedRouteId
    : randomUUID();

  return {
    id: routeId,
    receivedAt,
    method: request.method,
    path,
    requestedModel: typeof parsedBody?.model === "string" ? parsedBody.model : undefined,
    model: typeof parsedBody?.model === "string" ? parsedBody.model : undefined,
    stream: parsedBody?.stream === true,
    contentType,
    clientIp,
    requestBody: parsedBody as JsonValue | undefined,
  };
}

export function beginTrackedProxyRoute(options: BeginTrackedProxyRouteOptions): void {
  const { event, route, kind, upstreamStream, requestState, cancel } = options;
  requestState.trackConnection(route, kind, upstreamStream);
  setResponseHeader(event, "x-ai-proxy-request-id", route.id);
  requestState.setCancelHandler(route.id, cancel);
}
