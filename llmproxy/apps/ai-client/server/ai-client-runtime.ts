export { createAiClientConfigService } from "./ai-client-config-service";
import { createAiClientConfigService } from "./ai-client-config-service";
import type { AiClientNitroCapability } from "./ai-client-capability";
import type { AiClientConfigService } from "./ai-client-config-types";
import { recordAiClientGenAiRequestTrace } from "./ai-client-genai-telemetry";
import type { AiClientLoadBalancer } from "./ai-client-types";
import type { AiRequestMiddlewareRegistry } from "../../ai-request-middleware/server/ai-request-middleware-capability";
import type { OtelTracesService } from "../../otel/server/otel-capability";
export { LoadBalancer } from "./ai-client-load-balancer";
import { LoadBalancer } from "./ai-client-load-balancer";

export interface AiClientRuntimeDependencies {
  configService: AiClientConfigService;
  loadBalancer: LoadBalancer;
}

export interface AiClientRuntimeOptions {
  configService?: AiClientConfigService;
  otelTraces?: OtelTracesService;
  requestMiddleware?: AiRequestMiddlewareRegistry;
}

export function writeRequestLogLine(line: string): void {
  process.stdout.write(`${line}\n`);
}

export async function createAiClientRuntimeDependencies(
  options: AiClientConfigService | AiClientRuntimeOptions = createAiClientConfigService(),
): Promise<AiClientRuntimeDependencies> {
  const configService = isAiClientConfigService(options)
    ? options
    : options.configService ?? createAiClientConfigService();
  const otelTraces = isAiClientConfigService(options)
    ? undefined
    : options.otelTraces;
  const requestMiddleware = isAiClientConfigService(options)
    ? undefined
    : options.requestMiddleware;
  const config = await configService.load();
  let loadBalancer!: LoadBalancer;
  loadBalancer = new LoadBalancer(config, {
    requestLogWriter: writeRequestLogLine,
    requestLogObserver: otelTraces
      ? (detail, connection) => {
        recordAiClientGenAiRequestTrace(
          otelTraces,
          detail,
          connection,
          (debug) => {
            loadBalancer.mergeRequestOtelDebug(detail.entry.id, debug);
          },
        );
      }
      : undefined,
    requestMiddleware,
  });
  await loadBalancer.start();

  return {
    configService,
    loadBalancer,
  };
}

export function createAiClientNitroCapability(
  dependencies: {
    configService: AiClientConfigService;
    loadBalancer: AiClientLoadBalancer;
  },
): AiClientNitroCapability {
  return {
    configService: dependencies.configService,
    loadBalancer: dependencies.loadBalancer,
  };
}

function isAiClientConfigService(
  value: AiClientConfigService | AiClientRuntimeOptions,
): value is AiClientConfigService {
  return typeof (value as AiClientConfigService).load === "function"
    && typeof (value as AiClientConfigService).configPath === "string";
}
