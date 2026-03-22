import type { ConfiguredAiRequestRoutingMiddleware } from "../../../ai-request-middleware/server/ai-request-middleware-capability";
import type { KnownModel, ProxySnapshot } from "../../../shared/type-api";

export function buildHealthPayload(snapshot: ProxySnapshot) {
  const healthyBackends = snapshot.backends.filter((backend) => backend.healthy && backend.enabled).length;

  return {
    status: healthyBackends > 0 ? "ok" : "degraded",
    queueDepth: snapshot.queueDepth,
    backends: snapshot.backends.length,
    healthyBackends,
  };
}

export function buildModelsPayload(
  models: KnownModel[],
  middlewares: readonly ConfiguredAiRequestRoutingMiddleware[] = [],
) {
  return {
    object: "list" as const,
    data: [
      ...models.map((model) => ({
        id: model.id,
        object: "model" as const,
        created: 0,
        owned_by: "",
      })),
      ...buildMiddlewareModelEntries(middlewares),
    ],
  };
}

function buildMiddlewareModelEntries(
  middlewares: readonly ConfiguredAiRequestRoutingMiddleware[],
) {
  return [...middlewares]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((middleware) => ({
      id: `middleware:${middleware.id}`,
      object: "model" as const,
      created: 0,
      owned_by: "llmproxy.middleware",
      metadata: {
        llmproxy: {
          kind: "routing_middleware",
          middleware_id: middleware.id,
          selector: `middleware:${middleware.id}`,
          url: middleware.url,
          target_models: {
            small: middleware.models.small,
            large: middleware.models.large,
          },
        },
      },
    }));
}
