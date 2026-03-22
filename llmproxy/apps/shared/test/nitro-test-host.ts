import { fetchNodeRequestHandler } from "node-mock-http";
import {
  createApp,
  createRouter,
  eventHandler,
  fetchWithEvent,
  toNodeListener,
  type H3Event,
} from "h3";
import { createFetch } from "ofetch";

import {
  type TestLayerRuntime,
} from "./test-layer-runtime";

export interface NitroTestHostOptions {
  testLayers: readonly TestLayerRuntime[];
}

export function createNitroTestHost(options: NitroTestHostOptions) {
  const app = createApp();
  let nodeHandler: ReturnType<typeof toNodeListener> | undefined;
  type LocalNodeRequestHandler = Parameters<typeof fetchNodeRequestHandler>[0];

  const localFetch: typeof fetch = (input, init) => {
    if (!nodeHandler) {
      throw new Error("Nitro test host local fetch is not ready yet.");
    }

    if (input instanceof Request || !input.toString().startsWith("/")) {
      return globalThis.fetch(input, init);
    }

    return fetchNodeRequestHandler(nodeHandler as unknown as LocalNodeRequestHandler, input, init);
  };

  app.use(eventHandler((event) => {
    event.$fetch = createFetch({
      fetch: (request, init) => fetchWithEvent(event, request, init, { fetch: localFetch }),
    }) as typeof event.$fetch;
    for (const runtime of options.testLayers) {
      runtime.attachEventContext?.(event);
    }
  }));

  const router = createRouter();
  for (const runtime of options.testLayers) {
    runtime.registerRoutes?.(router);
  }
  app.use(router);

  nodeHandler = toNodeListener(app);
  return nodeHandler;
}
