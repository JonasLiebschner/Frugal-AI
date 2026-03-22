import type { AiClientModelRuntime } from "./ai-client-model-selection";
import {
  backendSupportsRequestedModel,
  isAutoModelRequest,
  isExplicitAutoModelRequest,
  listAutomaticModelsForRuntime,
  resolveModelForRuntime,
} from "./ai-client-model-selection";

export interface AiClientSelectableRuntime extends AiClientModelRuntime {}

export interface AiClientBackendSelection<TBackend extends AiClientSelectableRuntime> {
  backend: TBackend;
  model?: string;
}

interface PickAiClientBackendOptions<TBackend extends AiClientSelectableRuntime> {
  backends: TBackend[];
  model?: string;
  nextIndex: number;
  random: () => number;
}

interface PickAiClientBackendResult<TBackend extends AiClientSelectableRuntime> {
  selection?: AiClientBackendSelection<TBackend>;
  nextIndex: number;
}

export function hasMatchingAiClientBackend(
  backends: AiClientSelectableRuntime[],
  model?: string,
): boolean {
  return backends.some((backend) => backend.config.enabled && backendSupportsRequestedModel(backend, model));
}

export function pickAiClientBackend<TBackend extends AiClientSelectableRuntime>(
  options: PickAiClientBackendOptions<TBackend>,
): PickAiClientBackendResult<TBackend> {
  const { backends, model, nextIndex, random } = options;
  if (backends.length === 0) {
    return {
      nextIndex,
    };
  }

  if (isExplicitAutoModelRequest(model)) {
    const candidates: Array<AiClientBackendSelection<TBackend>> = [];

    for (const backend of backends) {
      if (!backend.config.enabled || !backend.healthy) {
        continue;
      }

      if (backend.activeRequests >= backend.config.maxConcurrency) {
        continue;
      }

      const resolvedModels = listAutomaticModelsForRuntime(backend);
      for (const resolvedModel of resolvedModels) {
        candidates.push({
          backend,
          model: resolvedModel,
        });
      }
    }

    if (candidates.length === 0) {
      return {
        nextIndex,
      };
    }

    const index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1);
    return {
      selection: candidates[index],
      nextIndex,
    };
  }

  const startIndex = isAutoModelRequest(model) ? 0 : nextIndex;

  for (let offset = 0; offset < backends.length; offset += 1) {
    const index = (startIndex + offset) % backends.length;
    const backend = backends[index];

    if (!backend.config.enabled || !backend.healthy) {
      continue;
    }

    if (backend.activeRequests >= backend.config.maxConcurrency) {
      continue;
    }

    const resolvedModel = resolveModelForRuntime(backend, model);
    if (resolvedModel === undefined) {
      continue;
    }

    return {
      selection: {
        backend,
        model: resolvedModel,
      },
      nextIndex: isAutoModelRequest(model) ? nextIndex : (index + 1) % backends.length,
    };
  }

  return {
    nextIndex,
  };
}
