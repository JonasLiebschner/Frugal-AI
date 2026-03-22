import type { JsonValue } from "../../shared/type-api";
import {
  createHttpAiRequestRoutingMiddleware,
  type AiRequestMiddlewareConfigService,
  type AiRequestMiddlewareNitroCapability,
  type AiRequestRoutingMiddleware,
  type ConfiguredAiRequestRoutingMiddleware,
} from "./ai-request-middleware-capability";

export function createAiRequestMiddlewareNitroCapability(
  configService: AiRequestMiddlewareConfigService,
): AiRequestMiddlewareNitroCapability {
  const registeredMiddlewares = new Map<string, AiRequestRoutingMiddleware>();
  let persistedMiddlewares: AiRequestRoutingMiddleware[] = [];
  let persistedMiddlewareConfigs: ConfiguredAiRequestRoutingMiddleware[] = [];

  function listMiddlewares(): AiRequestRoutingMiddleware[] {
    return [...persistedMiddlewares, ...registeredMiddlewares.values()]
      .sort((left, right) => {
        const leftOrder = left.order ?? 0;
        const rightOrder = right.order ?? 0;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.id.localeCompare(right.id);
      });
  }

  function findMiddleware(id: string): AiRequestRoutingMiddleware | undefined {
    return listMiddlewares().find((middleware) => middleware.id === id);
  }

  function replacePersistedMiddlewares(
    middlewares: ConfiguredAiRequestRoutingMiddleware[],
  ): void {
    for (const middleware of middlewares) {
      if (registeredMiddlewares.has(middleware.id)) {
        throw new Error(`Request middleware "${middleware.id}" is already registered.`);
      }
    }

    persistedMiddlewareConfigs = middlewares.map((middleware) => ({
      id: middleware.id,
      url: middleware.url,
      models: {
        small: middleware.models.small,
        large: middleware.models.large,
      },
    }));
    persistedMiddlewares = middlewares.map((middleware, index) => ({
      ...createHttpAiRequestRoutingMiddleware(middleware),
      order: index,
    }));
  }

  const capability: AiRequestMiddlewareNitroCapability = {
    configService,
    listConfiguredRoutingMiddlewares: () => persistedMiddlewareConfigs.map((middleware) => ({
      id: middleware.id,
      url: middleware.url,
      models: {
        small: middleware.models.small,
        large: middleware.models.large,
      },
    })),
    registerRoutingMiddleware: (middleware) => {
      if (registeredMiddlewares.has(middleware.id) || persistedMiddlewares.some((entry) => entry.id === middleware.id)) {
        throw new Error(`Request middleware "${middleware.id}" is already registered.`);
      }

      registeredMiddlewares.set(middleware.id, middleware);
      return middleware;
    },
    listRoutingMiddlewares: () => listMiddlewares().map((middleware) => ({
      id: middleware.id,
      order: middleware.order,
    })),
    resolveRoutingMiddleware: async (id, context) => {
      const middleware = findMiddleware(id);
      if (!middleware) {
        throw new Error(`Request middleware "${id}" is not registered.`);
      }

      const result = await middleware.route(context);
      const decisions = [];
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
    },
    replacePersistedMiddlewares,
    reload: async () => {
      const config = await configService.load();
      replacePersistedMiddlewares(config.middlewares);
      return config;
    },
  };

  return capability;
}
