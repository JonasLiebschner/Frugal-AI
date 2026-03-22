import type {
  AiClientNitroCapability,
} from "./ai-client-capability";

declare module "h3" {
  interface H3EventContext {
    aiClient: AiClientNitroCapability;
    clientDisconnectSignal: AbortSignal;
  }
}

declare module "nitropack" {
  interface NitroApp {
    $aiClient?: AiClientNitroCapability;
    $aiClientReady?: Promise<AiClientNitroCapability>;
  }
}

export {};
