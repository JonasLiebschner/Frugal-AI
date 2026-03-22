import type { OtelNitroCapability } from "./otel-capability";

declare module "h3" {
  interface H3EventContext {
    otel: OtelNitroCapability;
  }
}

declare module "nitropack" {
  interface NitroApp {
    $otel?: OtelNitroCapability;
    $otelReady?: Promise<OtelNitroCapability>;
  }
}

export {};
