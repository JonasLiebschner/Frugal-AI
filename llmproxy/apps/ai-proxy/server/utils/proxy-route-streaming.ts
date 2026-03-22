import type { H3Event } from "h3";
import {
  isOllamaNdjson,
} from "../../../ai-client/server/ai-client-capability";
import type { BackendLease, JsonValue, ProxyRouteRequest } from "../../../shared/type-api";
import type { LiveRequestState } from "../ai-proxy-types";
import {
  handleOllamaStreamingProxy,
  handleOpenAiStreamingProxy,
} from "./proxy-streaming-operations";
import {
  applyProxyRouteResponseHeaders,
  releaseProxyLease,
} from "./proxy-route-outcome";

type ProxyResponseMode = "raw" | "openai-sse" | "ollama-ndjson";

interface HandleProxyStreamingUpstreamResponseOptions {
  event: H3Event;
  requestState: LiveRequestState;
  route: ProxyRouteRequest;
  lease: BackendLease;
  receivedAt: number;
  routedModel?: string;
  upstreamResponse: Response;
  upstreamOutcome: "success" | "error";
  responseMode: ProxyResponseMode;
  streamingKind?: "chat.completions" | "completions";
  onResponseStart: (started: boolean) => void;
}

type ProxyStreamingRouteResult =
  | {
      handled: false;
    }
  | {
      handled: true;
      body: Record<string, unknown> | undefined;
    };

function isEventStream(headers: Headers): boolean {
  const contentType = headers.get("content-type");
  return typeof contentType === "string" && contentType.toLowerCase().includes("text/event-stream");
}

export async function handleProxyStreamingUpstreamResponse(
  options: HandleProxyStreamingUpstreamResponseOptions,
): Promise<ProxyStreamingRouteResult> {
  const {
    event,
    requestState,
    route,
    lease,
    receivedAt,
    routedModel,
    upstreamResponse,
    upstreamOutcome,
    responseMode,
    streamingKind,
    onResponseStart,
  } = options;

  if (
    responseMode === "ollama-ndjson" &&
    streamingKind &&
    upstreamResponse.ok &&
    isOllamaNdjson(upstreamResponse.headers) &&
    upstreamResponse.body
  ) {
    onResponseStart(route.stream);
    const synthesizedResponse = await handleOllamaStreamingProxy({
      event,
      requestState,
      requestId: route.id,
      clientStream: route.stream,
      backendId: lease.backend.id,
      model: routedModel,
      routingMiddlewareId: lease.routingMiddlewareId,
      routingMiddlewareProfile: lease.routingMiddlewareProfile,
      upstreamResponse,
    });

    releaseProxyLease({
      lease,
      requestState,
      requestId: route.id,
      receivedAt,
      outcome: "success",
      statusCode: upstreamResponse.status,
      responseBody: synthesizedResponse as JsonValue | undefined,
    });
    if (!route.stream) {
      applyProxyRouteResponseHeaders({
        event,
        requestId: route.id,
        backendId: lease.backend.id,
        model: routedModel,
        routingMiddlewareId: lease.routingMiddlewareId,
        routingMiddlewareProfile: lease.routingMiddlewareProfile,
        statusCode: upstreamResponse.status,
      });
    }

    return {
      handled: true,
      body: route.stream ? undefined : synthesizedResponse,
    };
  }

  if (
    responseMode === "openai-sse" &&
    streamingKind &&
    upstreamResponse.ok &&
    isEventStream(upstreamResponse.headers) &&
    upstreamResponse.body
  ) {
    onResponseStart(route.stream);
    const synthesizedResponse = await handleOpenAiStreamingProxy({
      event,
      requestState,
      requestId: route.id,
      kind: streamingKind,
      clientStream: route.stream,
      backendId: lease.backend.id,
      model: routedModel,
      routingMiddlewareId: lease.routingMiddlewareId,
      routingMiddlewareProfile: lease.routingMiddlewareProfile,
      upstreamResponse,
    });

    releaseProxyLease({
      lease,
      requestState,
      requestId: route.id,
      receivedAt,
      outcome: upstreamOutcome,
      statusCode: upstreamResponse.status,
      responseBody: synthesizedResponse as JsonValue | undefined,
    });
    if (!route.stream) {
      applyProxyRouteResponseHeaders({
        event,
        requestId: route.id,
        backendId: lease.backend.id,
        model: routedModel,
        routingMiddlewareId: lease.routingMiddlewareId,
        routingMiddlewareProfile: lease.routingMiddlewareProfile,
        statusCode: upstreamResponse.status,
      });
    }

    return {
      handled: true,
      body: route.stream ? undefined : synthesizedResponse,
    };
  }

  return {
    handled: false,
  };
}
