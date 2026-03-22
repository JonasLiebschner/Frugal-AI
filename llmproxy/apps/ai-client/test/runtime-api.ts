import type {
  AiClientConfigService,
  AiClientLoadBalancer,
} from "../server/ai-client-capability";
import { createAiClientRuntimeDependencies } from "../server/ai-client-runtime";

export interface AiClientTestRuntimeDependencies {
  configService: AiClientConfigService;
  loadBalancer: AiClientLoadBalancer;
}

export async function createAiClientTestRuntimeDependencies(
  configService: AiClientConfigService,
): Promise<AiClientTestRuntimeDependencies> {
  const { loadBalancer } = await createAiClientRuntimeDependencies(configService);

  return {
    configService,
    loadBalancer,
  };
}
