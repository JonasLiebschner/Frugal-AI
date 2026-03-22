import { chatWithModelToolProvider } from "./chat-with-model-tool";
import { diagnoseRequestToolProvider } from "./diagnose-request-tool";
import { getRequestDetailToolProvider } from "./get-request-detail-tool";
import { listModelsToolProvider } from "./list-models-tool";
import { listRequestsToolProvider } from "./list-requests-tool";
import type { AiProxyToolProvider } from "./tool-provider-types";

export const aiProxyToolRegistryToolProviders: AiProxyToolProvider[] = [
  listModelsToolProvider,
  chatWithModelToolProvider,
  listRequestsToolProvider,
  getRequestDetailToolProvider,
  diagnoseRequestToolProvider,
];
