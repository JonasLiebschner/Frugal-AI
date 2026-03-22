import type { H3Event } from "h3";
import { assignEventContext } from "../../shared/server/event-context";
import type { AiRequestMiddlewareNitroCapability } from "../../ai-request-middleware/server/ai-request-middleware-capability";
import { LiveRequestState, type LiveRequestStateOptions } from "./ai-proxy-live-request-state";
import type {
  AiClientNitroCapability,
  AiClientConfigService,
  AiClientLoadBalancer,
} from "../../ai-client/server/ai-client-capability";
import type { AiProxyService } from "./ai-proxy-types";
import { attachClientDisconnectSignal } from "./utils/client-disconnect";
import { handleProxyRoute, isSupportedProxyPath } from "./utils/proxy-route-operations";
import { buildHealthPayload, buildModelsPayload } from "./utils/public-route-payloads";

export function attachAiProxyEventContext(
  event: H3Event,
  services: AiProxyService,
): void {
  attachClientDisconnectSignal(event);
  assignEventContext(event, {
    aiProxy: services,
  });
}

export async function createAiProxyService(
  options: {
    configService: AiClientConfigService;
    loadBalancer: AiClientLoadBalancer;
    aiRequestMiddleware?: Pick<AiRequestMiddlewareNitroCapability, "listConfiguredRoutingMiddlewares">;
    sse: LiveRequestStateOptions["sse"];
  },
): Promise<AiProxyService> {
  const requestState = new LiveRequestState(options.loadBalancer, {
    sse: options.sse,
  });
  await requestState.start();

  return {
    configService: options.configService,
    loadBalancer: options.loadBalancer,
    requestState,
    buildHealthPayload: () => buildHealthPayload(options.loadBalancer.getSnapshot()),
    buildModelsPayload: () => buildModelsPayload(
      options.loadBalancer.listKnownModels(),
      options.aiRequestMiddleware?.listConfiguredRoutingMiddlewares() ?? [],
    ),
    isSupportedPublicPath: (pathname) => isSupportedProxyPath(pathname),
    handlePublicRoute: async (event) => handleProxyRoute({
      loadBalancer: options.loadBalancer,
      requestState,
    }, event),
    stop: async () => {
      await requestState.stop();
    },
  };
}

export async function createAiProxyServiceFromAiClient(
  aiClient: AiClientNitroCapability,
  sse: LiveRequestStateOptions["sse"],
  aiRequestMiddleware?: Pick<AiRequestMiddlewareNitroCapability, "listConfiguredRoutingMiddlewares">,
): Promise<AiProxyService> {
  return await createAiProxyService({
    configService: aiClient.configService,
    loadBalancer: aiClient.loadBalancer,
    aiRequestMiddleware,
    sse,
  });
}

declare const useNitroApp: () => {
  $aiProxy?: AiProxyService;
  $aiProxyReady?: Promise<AiProxyService>;
  $aiClient?: AiClientNitroCapability;
  $aiClientReady?: Promise<AiClientNitroCapability>;
  $aiRequestMiddleware?: AiRequestMiddlewareNitroCapability;
  $aiRequestMiddlewareReady?: Promise<AiRequestMiddlewareNitroCapability>;
  $sse?: LiveRequestStateOptions["sse"];
};

export function ensureAiProxyNitroCapability(
  nitroApp = useNitroApp(),
  createServiceFromAiClient: typeof createAiProxyServiceFromAiClient = createAiProxyServiceFromAiClient,
): Promise<AiProxyService> {
  if (nitroApp.$aiProxy) {
    return Promise.resolve(nitroApp.$aiProxy);
  }

  if (nitroApp.$aiProxyReady) {
    return nitroApp.$aiProxyReady;
  }

  const aiClientReady = nitroApp.$aiClientReady
    ?? (nitroApp.$aiClient ? Promise.resolve(nitroApp.$aiClient) : undefined);
  if (!aiClientReady) {
    throw new Error("ai-proxy requires the ai-client Nitro capability to be available.");
  }

  if (!nitroApp.$sse) {
    throw new Error("ai-proxy requires the sse Nitro capability to be available.");
  }

  const capabilityPromise = aiClientReady
    .then(async (aiClient) => createServiceFromAiClient(
      aiClient,
      nitroApp.$sse!,
      nitroApp.$aiRequestMiddleware
        ?? await nitroApp.$aiRequestMiddlewareReady?.catch(() => undefined),
    ))
    .then((service) => {
      nitroApp.$aiProxy = service;
      return service;
    });

  nitroApp.$aiProxyReady = capabilityPromise;
  return capabilityPromise;
}

export async function requireAiProxyCapability(
  event: H3Event,
): Promise<AiProxyService> {
  return event.context.aiProxy ?? await ensureAiProxyNitroCapability();
}
