import type { ConfigCapability } from "./config-capability";

declare module "h3" {
  interface H3EventContext {
    config: ConfigCapability;
  }
}

declare module "nitropack" {
  interface NitroApp {
    $config: ConfigCapability;
  }
}

export {};
