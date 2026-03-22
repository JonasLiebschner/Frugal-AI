import type {
  AiProxyNitroCapability,
  AiProxyRouteContext,
} from "./ai-proxy-runtime";

declare module "h3" {
  interface H3EventContext extends AiProxyRouteContext {}
}

declare module "nitropack" {
  interface NitroApp {
    $aiProxy?: AiProxyNitroCapability;
    $aiProxyReady?: Promise<AiProxyNitroCapability>;
  }
}

export {};
