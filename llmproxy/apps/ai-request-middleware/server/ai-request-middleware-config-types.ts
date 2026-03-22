import type { ConfigService, ConfigUtils } from "../../config/server/config-capability";
import type {
  AiRequestMiddlewareConfig,
  AiRequestRoutingMiddlewareEditorConfig,
  AiRequestRoutingMiddlewareSavePayload,
} from "./ai-request-middleware-types";

export interface AiRequestMiddlewareConfigService {
  readonly configPath: string;
  load: () => Promise<AiRequestMiddlewareConfig>;
  save: (config: AiRequestMiddlewareConfig) => void;
  listEditableMiddlewares: () => Promise<AiRequestRoutingMiddlewareEditorConfig[]>;
  createMiddleware: (payload: AiRequestRoutingMiddlewareSavePayload) => Promise<AiRequestRoutingMiddlewareEditorConfig>;
  replaceMiddleware: (
    currentId: string,
    payload: AiRequestRoutingMiddlewareSavePayload,
  ) => Promise<AiRequestRoutingMiddlewareEditorConfig>;
  deleteMiddleware: (id: string) => Promise<void>;
}

export interface AiRequestMiddlewareConfigServiceOptions {
  config?: ConfigService;
  utils?: ConfigUtils;
}
