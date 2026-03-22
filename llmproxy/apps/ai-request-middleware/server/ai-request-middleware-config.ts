import { isRecord } from "../../shared/server/type-guards";
import type {
  AiRequestMiddlewareConfig,
  ConfiguredAiRequestRoutingMiddleware,
  AiRequestRoutingModelMap,
} from "./ai-request-middleware-types";

const AI_REQUEST_MIDDLEWARE_CONFIG_ROOT_KEYS = new Set([
  "middlewares",
]);

export function normalizeAiRequestMiddlewareConfig(
  input: unknown,
  configPath: string,
): AiRequestMiddlewareConfig {
  const config = assertValidAiRequestMiddlewareConfigShape(input, configPath);
  const middlewares = Array.isArray(config.middlewares)
    ? config.middlewares.map((middleware, index) => normalizeConfiguredRoutingMiddleware(middleware, configPath, index))
    : [];
  const uniqueIds = new Set<string>();

  for (const middleware of middlewares) {
    if (uniqueIds.has(middleware.id)) {
      throw new Error(`Duplicate ai-request-middleware id "${middleware.id}" in ${configPath}.`);
    }

    uniqueIds.add(middleware.id);
  }

  return {
    middlewares,
  };
}

export function serializeAiRequestMiddlewareConfig(
  config: AiRequestMiddlewareConfig,
): Record<string, unknown> {
  return {
    middlewares: config.middlewares.map((middleware) => ({
      id: middleware.id,
      url: middleware.url,
      models: {
        small: middleware.models.small,
        large: middleware.models.large,
      },
    })),
  };
}

function assertValidAiRequestMiddlewareConfigShape(
  input: unknown,
  configPath: string,
): { middlewares?: unknown } {
  if (input === undefined) {
    return {};
  }

  if (!isRecord(input)) {
    throw new Error(`Invalid ai-request-middleware config file ${configPath}. Expected a JSON object.`);
  }

  const unsupportedKeys = Object.keys(input)
    .filter((key) => !AI_REQUEST_MIDDLEWARE_CONFIG_ROOT_KEYS.has(key));
  if (unsupportedKeys.length > 0) {
    throw new Error(
      `Invalid ai-request-middleware config file ${configPath}. Unsupported root properties: ${unsupportedKeys.map((key) => `"${key}"`).join(", ")}.`,
    );
  }

  return input;
}

function normalizeConfiguredRoutingMiddleware(
  input: unknown,
  configPath: string,
  index: number,
): ConfiguredAiRequestRoutingMiddleware {
  if (!isRecord(input)) {
    throw new Error(`Configured ai-request-middleware entry #${index + 1} in ${configPath} must be an object.`);
  }

  const id = typeof input.id === "string" ? input.id.trim() : "";
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const models = normalizeMiddlewareModelMap(input.models, id || `#${index + 1}`, configPath);

  if (id.length === 0) {
    throw new Error(`Configured ai-request-middleware entry #${index + 1} in ${configPath} requires a string id.`);
  }

  if (url.length === 0) {
    throw new Error(`Configured ai-request-middleware "${id}" in ${configPath} requires a string url.`);
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(`Configured ai-request-middleware "${id}" in ${configPath} requires a valid http(s) url.`);
  }

  return {
    id,
    url,
    models,
  };
}

function normalizeMiddlewareModelMap(
  input: unknown,
  middlewareId: string,
  configPath: string,
): AiRequestRoutingModelMap {
  if (!isRecord(input)) {
    throw new Error(`Configured ai-request-middleware "${middlewareId}" in ${configPath} requires a "models" object.`);
  }

  const small = typeof input.small === "string" ? input.small.trim() : "";
  const large = typeof input.large === "string" ? input.large.trim() : "";

  if (small.length === 0) {
    throw new Error(`Configured ai-request-middleware "${middlewareId}" in ${configPath} requires a non-empty "models.small" string.`);
  }

  if (large.length === 0) {
    throw new Error(`Configured ai-request-middleware "${middlewareId}" in ${configPath} requires a non-empty "models.large" string.`);
  }

  return {
    small,
    large,
  };
}
