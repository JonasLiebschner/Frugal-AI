import type { SseCapability } from "./sse-capability";

declare module "nitropack" {
  interface NitroApp {
    $sse?: SseCapability;
  }
}

export {};
