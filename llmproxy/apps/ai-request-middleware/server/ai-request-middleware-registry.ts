import type { JsonValue } from "../../shared/type-api";
import type {
  AiRequestMiddlewareRegistry,
  AiRequestRoutingMiddleware,
  AiRequestRoutingMiddlewareContext,
  AiRequestRoutingResult,
} from "./ai-request-middleware-types";

export function createAiRequestMiddlewareRegistry(): AiRequestMiddlewareRegistry {
  const middlewares = new Map<string, AiRequestRoutingMiddleware>();

  return {
    registerRoutingMiddleware: (middleware) => {
      if (middlewares.has(middleware.id)) {
        throw new Error(`Request middleware "${middleware.id}" is already registered.`);
      }

      middlewares.set(middleware.id, middleware);
      return middleware;
    },
    listRoutingMiddlewares: () => listMiddlewares(middlewares)
      .map((middleware) => ({
        id: middleware.id,
        order: middleware.order,
      })),
    resolveRoutingMiddleware: async (id, context) => await resolveRoutingMiddleware(middlewares, id, context),
  };
}

async function resolveRoutingMiddleware(
  middlewares: Map<string, AiRequestRoutingMiddleware>,
  id: string,
  context: AiRequestRoutingMiddlewareContext,
): Promise<AiRequestRoutingResult> {
  const middleware = middlewares.get(id);
  if (!middleware) {
    throw new Error(`Request middleware "${id}" is not registered.`);
  }

  const result = await middleware.route(context);
  const decisions: AiRequestRoutingResult["decisions"] = [];
  let mergedMetadata: Record<string, JsonValue> | undefined;

  if (result?.metadata) {
    mergedMetadata = {
      ...result.metadata,
    };
  }

  if (result) {
    decisions.push({
      id: middleware.id,
      ...(result.model !== undefined ? { model: result.model } : {}),
      ...(result.metadata ? { metadata: result.metadata } : {}),
      ...(result.stop ? { stop: true } : {}),
    });
  }

  return {
    ...(result?.model !== undefined ? { model: result.model } : {}),
    ...(mergedMetadata ? { metadata: mergedMetadata } : {}),
    decisions,
  };
}

function listMiddlewares(
  middlewares: Map<string, AiRequestRoutingMiddleware>,
): AiRequestRoutingMiddleware[] {
  return Array.from(middlewares.values())
    .sort((left, right) => {
      const orderDelta = (left.order ?? 0) - (right.order ?? 0);
      if (orderDelta !== 0) {
        return orderDelta;
      }

      return left.id.localeCompare(right.id);
    });
}
