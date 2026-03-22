import type { H3Event } from "h3";
import type { NitroApp } from "nitropack";

import {
  attachAiClientEventContext,
  createAiClientService,
} from "./ai-client-service";
import { closeNitroLifecycle } from "../../shared/server/nitro-lifecycle-hooks";

export function setupAiClientNitroPlugin(
  nitroApp: NitroApp,
  createService: typeof createAiClientService = createAiClientService,
): void {
  const otelCapabilityPromise = nitroApp.$otelReady?.catch(() => undefined);
  const requestMiddlewareCapabilityPromise = nitroApp.$aiRequestMiddlewareReady?.catch(() => undefined);
  const servicePromise = (async () => {
    const [otel, requestMiddleware] = await Promise.all([
      otelCapabilityPromise,
      requestMiddlewareCapabilityPromise,
    ]);
    const service = await createService({
      otelTraces: otel?.traces,
      requestMiddleware,
    });
    nitroApp.$aiClient = service;
    return service;
  })();

  nitroApp.$aiClientReady = servicePromise;
  nitroApp.hooks.hook("request", async (event: H3Event) => {
    attachAiClientEventContext(event, await servicePromise);
  });
  closeNitroLifecycle(nitroApp, async () => {
    const service = await servicePromise.catch(() => undefined);
    if (service) {
      await service.stop();
    }
  });
}
