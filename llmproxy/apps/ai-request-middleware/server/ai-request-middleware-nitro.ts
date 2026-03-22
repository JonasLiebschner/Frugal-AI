import type { H3Event } from "h3";
import type { NitroApp } from "nitropack";

import { assignEventContext } from "../../shared/server/event-context";
import {
  createAiRequestMiddlewareConfigService,
  createAiRequestMiddlewareNitroCapability,
  type AiRequestMiddlewareNitroCapability,
} from "./ai-request-middleware-capability";
import type { AiRequestMiddlewareConfigService } from "./ai-request-middleware-config-types";

export function attachAiRequestMiddlewareEventContext(
  event: H3Event,
  capability: AiRequestMiddlewareNitroCapability,
): void {
  assignEventContext(event, {
    aiRequestMiddleware: capability,
  });
}

export function setupAiRequestMiddlewareNitroPlugin(
  nitroApp: NitroApp,
  configService: AiRequestMiddlewareConfigService = createAiRequestMiddlewareConfigService(),
): void {
  const capability = createAiRequestMiddlewareNitroCapability(configService);
  nitroApp.$aiRequestMiddleware = capability;

  const capabilityPromise = capability.reload().then(() => capability);

  nitroApp.$aiRequestMiddlewareReady = capabilityPromise;
  nitroApp.hooks.hook("request", async (event: H3Event) => {
    attachAiRequestMiddlewareEventContext(event, await capabilityPromise);
  });
}
