export { parseAiRequestPrompt } from "./ai-request-middleware-prompt";
export { createAiRequestMiddlewareConfigService } from "./ai-request-middleware-config-service";
export { createHttpAiRequestRoutingMiddleware } from "./ai-request-middleware-http";
export { createAiRequestMiddlewareRegistry } from "./ai-request-middleware-registry";
export { createAiRequestMiddlewareNitroCapability } from "./ai-request-middleware-runtime";

import type {
  AiRequestMiddlewareConfig,
  AiRequestMiddlewareRegistry as PublicAiRequestMiddlewareRegistry,
  ConfiguredAiRequestRoutingMiddleware,
} from "./ai-request-middleware-types";
import type { AiRequestMiddlewareConfigService } from "./ai-request-middleware-config-types";

export type {
  AiRequestMiddlewareConfig,
  AiRequestRoutingMiddlewareEditorConfig,
  AiRequestMiddlewareRegistry,
  AiRequestRoutingHttpRequest,
  AiRequestRoutingHttpResponse,
  AiRequestPromptMessage,
  AiRequestPromptPart,
  AiRequestPromptPartType,
  AiRequestRoutingMiddleware,
  AiRequestRoutingMiddlewareContext,
  AiRequestRoutingMiddlewareDecision,
  AiRequestRoutingMiddlewareResult,
  AiRequestRoutingResult,
  AiRequestRoutingMiddlewareSavePayload,
  ConfiguredAiRequestRoutingMiddleware,
  ParsedAiRequestPrompt,
} from "./ai-request-middleware-types";
export type {
  AiRequestMiddlewareConfigService,
  AiRequestMiddlewareConfigServiceOptions,
} from "./ai-request-middleware-config-types";

export interface AiRequestMiddlewareNitroCapability extends PublicAiRequestMiddlewareRegistry {
  configService: AiRequestMiddlewareConfigService;
  listConfiguredRoutingMiddlewares: () => ConfiguredAiRequestRoutingMiddleware[];
  replacePersistedMiddlewares: (
    middlewares: ConfiguredAiRequestRoutingMiddleware[],
  ) => void;
  reload: () => Promise<AiRequestMiddlewareConfig>;
}

export const AI_REQUEST_MIDDLEWARE_MODEL_PREFIX = "middleware:";

export function parseAiRequestMiddlewareSelection(model: string | undefined): string | undefined {
  if (typeof model !== "string") {
    return undefined;
  }

  if (!model.startsWith(AI_REQUEST_MIDDLEWARE_MODEL_PREFIX)) {
    return undefined;
  }

  const middlewareId = model.slice(AI_REQUEST_MIDDLEWARE_MODEL_PREFIX.length).trim();
  return middlewareId.length > 0 ? middlewareId : "";
}
