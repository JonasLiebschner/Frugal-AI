import type { KnownModel, ProxyRouteRequest } from "../../shared/type-api";
import {
  parseAiRequestMiddlewareSelection,
  parseAiRequestPrompt,
  type AiRequestMiddlewareRegistry,
} from "../../ai-request-middleware/server/ai-request-middleware-capability";
import { readRoutingMiddlewareProfile } from "./ai-client-model-selection";

interface ApplyAiRequestRoutingMiddlewareOptions {
  knownModels: KnownModel[];
  requestMiddleware?: AiRequestMiddlewareRegistry;
  signal?: AbortSignal;
  validateRoutedModel?: (model: string) => string | undefined;
}

export async function applyAiRequestRoutingMiddleware(
  route: ProxyRouteRequest,
  options: ApplyAiRequestRoutingMiddlewareOptions,
): Promise<ProxyRouteRequest> {
  const { knownModels, requestMiddleware, signal } = options;
  if (!requestMiddleware) {
    return route;
  }

  const requestedModel = route.requestedModel ?? route.model;
  const middlewareId = parseAiRequestMiddlewareSelection(requestedModel);
  if (middlewareId === undefined) {
    return route;
  }

  if (middlewareId.length === 0) {
    throw new Error('Invalid middleware model selector. Expected "middleware:<id>".');
  }

  const resolution = await requestMiddleware.resolveRoutingMiddleware(middlewareId, {
    route,
    requestedModel,
    prompt: parseAiRequestPrompt(route.requestBody),
    knownModels,
    signal,
  });

  if (resolution.model === undefined || resolution.model.trim().length === 0) {
    throw new Error(`AI request middleware "${middlewareId}" did not resolve a routed model.`);
  }

  const routedModel = resolution.model.trim();
  const routingError = options.validateRoutedModel?.(routedModel);
  if (routingError) {
    throw new Error(`AI request middleware "${middlewareId}" resolved unroutable model "${routedModel}": ${routingError}`);
  }

  return {
    ...route,
    requestedModel,
    model: routedModel,
    routingMiddlewareId: middlewareId,
    routingMiddlewareProfile: readRoutingMiddlewareProfile(resolution.metadata),
  };
}
