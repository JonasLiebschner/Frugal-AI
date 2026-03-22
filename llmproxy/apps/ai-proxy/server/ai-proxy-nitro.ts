import type { H3Event } from "h3";
import type { NitroApp } from "nitropack";

import { closeNitroLifecycle } from "../../shared/server/nitro-lifecycle-hooks";
import {
  attachAiProxyEventContext,
  createAiProxyServiceFromAiClient,
  ensureAiProxyNitroCapability,
} from "./ai-proxy-runtime";
import type { AiProxyNitroCapability } from "./ai-proxy-runtime";

export function setupAiProxyNitroPlugin(
  nitroApp: NitroApp,
  createServiceFromAiClient: typeof createAiProxyServiceFromAiClient = createAiProxyServiceFromAiClient,
): void {
  nitroApp.hooks.hook("request", async (event: H3Event) => {
    attachAiProxyEventContext(event, await ensureAiProxyNitroCapability(nitroApp, createServiceFromAiClient));
  });
  closeNitroLifecycle(nitroApp, async () => {
    const service = await nitroApp.$aiProxyReady?.catch(() => undefined);
    if (service) {
      await service.stop();
    }
  });
}
