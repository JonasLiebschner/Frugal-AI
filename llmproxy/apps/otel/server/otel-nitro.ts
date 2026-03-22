import type { H3Event } from "h3";
import type { NitroApp } from "nitropack";

import { assignEventContext } from "../../shared/server/event-context";
import { closeNitroLifecycle } from "../../shared/server/nitro-lifecycle-hooks";
import { createOtelNitroCapability, createOtelService } from "./otel-runtime";
import type { OtelNitroCapability, OtelService } from "./otel-types";

export function attachOtelEventContext(
  event: H3Event,
  capability: OtelNitroCapability,
): void {
  assignEventContext(event, {
    otel: capability,
  });
}

export function setupOtelNitroPlugin(
  nitroApp: NitroApp,
  createService: typeof createOtelService = createOtelService,
): void {
  const servicePromise = createService().then((service) => {
    const capability = createOtelNitroCapability(service);
    nitroApp.$otel = capability;
    return {
      service,
      capability,
    };
  });

  nitroApp.$otelReady = servicePromise.then((result) => result.capability);
  nitroApp.hooks.hook("request", async (event: H3Event) => {
    const { capability } = await servicePromise;
    attachOtelEventContext(event, capability);
  });
  closeNitroLifecycle(nitroApp, async () => {
    const services = await servicePromise.catch(() => undefined);
    if (services) {
      await services.service.stop();
    }
  });
}
