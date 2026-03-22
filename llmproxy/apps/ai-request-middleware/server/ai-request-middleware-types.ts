import type { JsonValue, KnownModel, ProxyRouteRequest } from "../../shared/type-api";

export type AiRequestRoutingModelClass = "small" | "large";

export interface AiRequestRoutingModelMap {
  small: string;
  large: string;
}

export type AiRequestPromptPartType =
  | "text"
  | "image"
  | "tool_call"
  | "tool_result";

export interface AiRequestPromptPart {
  type: AiRequestPromptPartType;
  text?: string;
  id?: string;
  name?: string;
  data?: JsonValue;
}

export interface AiRequestPromptMessage {
  role: string;
  parts: AiRequestPromptPart[];
  text?: string;
}

export interface ParsedAiRequestPrompt {
  kind: "chat" | "prompt" | "unknown";
  messages: AiRequestPromptMessage[];
  systemText?: string;
  userText?: string;
  lastUserText?: string;
  toolNames: string[];
}

export interface AiRequestRoutingMiddlewareContext {
  route: ProxyRouteRequest;
  requestedModel?: string;
  prompt: ParsedAiRequestPrompt | null;
  knownModels: KnownModel[];
  signal?: AbortSignal;
}

export interface ConfiguredAiRequestRoutingMiddleware {
  id: string;
  url: string;
  models: AiRequestRoutingModelMap;
}

export interface AiRequestRoutingMiddlewareEditorConfig extends ConfiguredAiRequestRoutingMiddleware {}

export interface AiRequestMiddlewareConfig {
  middlewares: ConfiguredAiRequestRoutingMiddleware[];
}

export interface AiRequestRoutingMiddlewareSavePayload extends ConfiguredAiRequestRoutingMiddleware {}

export interface AiRequestRoutingHttpRequest {
  query: string;
}

export interface AiRequestRoutingHttpResponse {
  result?: AiRequestRoutingModelClass;
  model?: string;
}

export interface AiRequestRoutingMiddlewareResult {
  model?: string;
  metadata?: Record<string, JsonValue>;
  stop?: boolean;
}

export interface AiRequestRoutingMiddlewareDecision
  extends AiRequestRoutingMiddlewareResult {
  id: string;
}

export interface AiRequestRoutingMiddleware {
  id: string;
  order?: number;
  route: (
    context: AiRequestRoutingMiddlewareContext,
  ) => Promise<AiRequestRoutingMiddlewareResult | void> | AiRequestRoutingMiddlewareResult | void;
}

export interface AiRequestRoutingResult {
  model?: string;
  metadata?: Record<string, JsonValue>;
  decisions: AiRequestRoutingMiddlewareDecision[];
}

export interface AiRequestMiddlewareRegistry {
  registerRoutingMiddleware: (
    middleware: AiRequestRoutingMiddleware,
  ) => AiRequestRoutingMiddleware;
  listRoutingMiddlewares: () => Array<Pick<AiRequestRoutingMiddleware, "id" | "order">>;
  resolveRoutingMiddleware: (
    id: string,
    context: AiRequestRoutingMiddlewareContext,
  ) => Promise<AiRequestRoutingResult>;
}
