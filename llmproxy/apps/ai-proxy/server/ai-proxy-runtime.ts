import {
  attachAiProxyEventContext,
  createAiProxyServiceFromAiClient,
  createAiProxyService,
  ensureAiProxyNitroCapability,
  requireAiProxyCapability,
} from "./ai-proxy-service";
import type { AiProxyService, LiveRequestState } from "./ai-proxy-types";

export {
  attachAiProxyEventContext,
  createAiProxyService,
  createAiProxyServiceFromAiClient,
  ensureAiProxyNitroCapability,
  requireAiProxyCapability,
};
export type {
  AiProxyService,
};

export interface AiProxyRouteContext {
  aiProxy: AiProxyService;
  clientDisconnectSignal: AbortSignal;
}

export type AiProxyNitroCapability = AiProxyService;
