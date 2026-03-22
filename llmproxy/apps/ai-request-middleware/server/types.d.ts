import type { AiRequestMiddlewareNitroCapability } from "./ai-request-middleware-capability";

declare module "h3" {
  interface H3EventContext {
    aiRequestMiddleware: AiRequestMiddlewareNitroCapability;
  }
}

declare module "nitropack" {
  interface NitroApp {
    $aiRequestMiddleware?: AiRequestMiddlewareNitroCapability;
    $aiRequestMiddlewareReady?: Promise<AiRequestMiddlewareNitroCapability>;
  }
}

export {};
