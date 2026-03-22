import type {
  ToolRegistryNitroCapability,
  ToolRegistryRouteContext,
} from "./tool-registry-capability";

declare module "h3" {
  interface H3EventContext {
    toolRegistry: ToolRegistryRouteContext;
  }
}

declare module "nitropack" {
  interface NitroApp {
    $toolRegistry?: ToolRegistryNitroCapability;
  }
}

export {};
