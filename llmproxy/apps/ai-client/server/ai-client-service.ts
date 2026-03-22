import type { H3Event } from "h3";
import { assignEventContext } from "../../shared/server/event-context";
import type { AiRequestMiddlewareRegistry } from "../../ai-request-middleware/server/ai-request-middleware-capability";
import type { OtelTracesService } from "../../otel/server/otel-capability";
import type { AiClientLoadBalancer } from "./ai-client-types";
import {
  createAiClientNitroCapability,
  createAiClientRuntimeDependencies,
} from "./ai-client-runtime";
import type { AiClientConfigService } from "./ai-client-config-types";

export interface AiClientService {
  configService: AiClientConfigService;
  loadBalancer: AiClientLoadBalancer;
  stop: () => Promise<void>;
}

export interface AiClientContextServices {
  configService: AiClientConfigService;
  loadBalancer: AiClientLoadBalancer;
}

export function attachAiClientEventContext(
  event: H3Event,
  services: AiClientContextServices,
): void {
  assignEventContext(event, {
    aiClient: createAiClientNitroCapability(services),
  });
}

export async function createAiClientService(
  options: {
    configService?: AiClientConfigService;
    otelTraces?: OtelTracesService;
    requestMiddleware?: AiRequestMiddlewareRegistry;
  },
): Promise<AiClientService> {
  const { configService, loadBalancer } = await createAiClientRuntimeDependencies({
    configService: options.configService,
    otelTraces: options.otelTraces,
    requestMiddleware: options.requestMiddleware,
  });

  return {
    configService,
    loadBalancer,
    stop: async () => {
      await loadBalancer.stop();
    },
  };
}
