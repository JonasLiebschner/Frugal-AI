import { createAppConfigStore } from "../../config/server/config-capability";
import {
  normalizeAiRequestMiddlewareConfig,
  serializeAiRequestMiddlewareConfig,
} from "./ai-request-middleware-config";
import type {
  AiRequestMiddlewareConfig,
  AiRequestRoutingMiddlewareEditorConfig,
  AiRequestRoutingMiddlewareSavePayload,
} from "./ai-request-middleware-types";
import type {
  AiRequestMiddlewareConfigService,
  AiRequestMiddlewareConfigServiceOptions,
} from "./ai-request-middleware-config-types";

export function createAiRequestMiddlewareConfigService(
  options: AiRequestMiddlewareConfigServiceOptions = {},
): AiRequestMiddlewareConfigService {
  const document = createAppConfigStore<unknown, AiRequestMiddlewareConfig>({
    packageName: "ai-request-middleware",
    config: options.config,
    utils: options.utils,
    normalize: normalizeAiRequestMiddlewareConfig,
    serialize: serializeAiRequestMiddlewareConfig,
  });

  return {
    configPath: document.configPath,
    load: async () => await document.load(),
    save: (config) => {
      document.save(config);
    },
    listEditableMiddlewares: async () => {
      const config = await document.load();
      return config.middlewares.map(toEditorConfig);
    },
    createMiddleware: async (payload) => {
      const current = await document.load();
      const candidate = normalizeMiddlewarePayload(payload, document.configPath);
      current.middlewares.push(candidate);

      const next = normalizeAiRequestMiddlewareConfig(current, document.configPath);
      document.save(next);
      return findPersistedMiddleware(next, candidate.id, document.configPath);
    },
    replaceMiddleware: async (currentId, payload) => {
      const current = await document.load();
      const middlewareIndex = current.middlewares.findIndex((entry) => entry.id === currentId);

      if (middlewareIndex < 0) {
        throw new Error(`AI request middleware "${currentId}" was not found in ${document.configPath}.`);
      }

      const candidate = normalizeMiddlewarePayload(payload, document.configPath);
      current.middlewares.splice(middlewareIndex, 1, candidate);

      const next = normalizeAiRequestMiddlewareConfig(current, document.configPath);
      document.save(next);
      return findPersistedMiddleware(next, candidate.id, document.configPath);
    },
    deleteMiddleware: async (id) => {
      const current = await document.load();
      const middlewareIndex = current.middlewares.findIndex((entry) => entry.id === id);

      if (middlewareIndex < 0) {
        throw new Error(`AI request middleware "${id}" was not found in ${document.configPath}.`);
      }

      current.middlewares.splice(middlewareIndex, 1);

      const next = normalizeAiRequestMiddlewareConfig(current, document.configPath);
      document.save(next);
    },
  };
}

function normalizeMiddlewarePayload(
  payload: AiRequestRoutingMiddlewareSavePayload,
  configPath: string,
) {
  return normalizeAiRequestMiddlewareConfig({
    middlewares: [payload],
  }, configPath).middlewares[0];
}

function toEditorConfig(
  middleware: AiRequestMiddlewareConfig["middlewares"][number],
): AiRequestRoutingMiddlewareEditorConfig {
  return {
    id: middleware.id,
    url: middleware.url,
    models: {
      small: middleware.models.small,
      large: middleware.models.large,
    },
  };
}

function findPersistedMiddleware(
  config: AiRequestMiddlewareConfig,
  id: string,
  configPath: string,
): AiRequestRoutingMiddlewareEditorConfig {
  const middleware = config.middlewares.find((entry) => entry.id === id);
  if (!middleware) {
    throw new Error(`AI request middleware "${id}" could not be persisted in ${configPath}.`);
  }

  return toEditorConfig(middleware);
}
