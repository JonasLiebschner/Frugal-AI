import { type BackendLease, type ProxyRouteRequest } from "../../shared/type-api";
import { type AiClientBackendRuntime } from "./ai-client-backend-runtime";
import { pickAiClientBackend } from "./ai-client-backend-selection";
import { applyLeaseResult } from "./ai-client-lease-outcome";
import { type AiClientRequestLogStore } from "./ai-client-request-log";

interface TryAcquireAiClientLeaseOptions {
  backends: AiClientBackendRuntime[];
  route: ProxyRouteRequest;
  nextIndex: number;
  random: () => number;
  requestLog: AiClientRequestLogStore;
  resolveRuntime: (id: string, fallback: AiClientBackendRuntime) => AiClientBackendRuntime;
  emitSnapshot: () => void;
  pumpQueue: () => void;
}

interface TryAcquireAiClientLeaseResult {
  lease?: BackendLease;
  nextIndex: number;
}

export function tryAcquireAiClientLease(
  options: TryAcquireAiClientLeaseOptions,
): TryAcquireAiClientLeaseResult {
  const {
    backends,
    route,
    nextIndex,
    random,
    requestLog,
    resolveRuntime,
    emitSnapshot,
    pumpQueue,
  } = options;
  const selection = pickAiClientBackend({
    backends,
    model: route.model,
    nextIndex,
    random,
  });

  if (!selection.selection) {
    return {
      nextIndex: selection.nextIndex,
    };
  }

  const { backend, model: selectedModel } = selection.selection;
  const queueMs = Date.now() - route.receivedAt;
  backend.activeRequests += 1;
  backend.totalRequests += 1;
  backend.lastError = undefined;
  emitSnapshot();

  let released = false;

  return {
    nextIndex: selection.nextIndex,
    lease: {
      requestId: route.id,
      backend: backend.config,
      selectedModel,
      routingMiddlewareId: route.routingMiddlewareId,
      routingMiddlewareProfile: route.routingMiddlewareProfile,
      resolvedHeaders: { ...backend.resolvedHeaders },
      queueMs,
      release: (result) => {
        if (released) {
          return;
        }

        released = true;
        const runtime = resolveRuntime(backend.config.id, backend);
        const entry = applyLeaseResult(runtime, route, selectedModel, result);
        requestLog.record(entry, route.requestBody, result.responseBody);

        pumpQueue();
        emitSnapshot();
      },
    },
  };
}
