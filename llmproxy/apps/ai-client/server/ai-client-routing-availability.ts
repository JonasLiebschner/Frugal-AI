import { hasMatchingAiClientBackend, type AiClientSelectableRuntime } from "./ai-client-backend-selection";
import { isAutoModelRequest } from "./ai-client-model-selection";

export function getAiClientRoutingAvailabilityError(
  backends: AiClientSelectableRuntime[],
  model?: string,
): string | undefined {
  if (backends.length === 0) {
    return "No backends configured.";
  }

  if (!backends.some((backend) => backend.config.enabled)) {
    return "No enabled backends available.";
  }

  if (!hasMatchingAiClientBackend(backends, model)) {
    if (isAutoModelRequest(model)) {
      return "No backend with a concrete model is currently available for automatic model selection.";
    }

    return model
      ? `No backend configured for model "${model}".`
      : "No backend can serve this request.";
  }

  return undefined;
}
