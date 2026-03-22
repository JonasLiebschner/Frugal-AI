import { compactJsonForRetention } from "../../shared/server/retained-json";
import {
  AiClientConfig,
  DiscoveredModelDetail,
  JsonValue,
  KnownModel,
} from "../../shared/type-api";

export interface AiClientModelRuntime {
  config: AiClientConfig["connections"][number];
  activeRequests: number;
  healthy: boolean;
  discoveredModels: string[];
  discoveredModelDetails: DiscoveredModelDetail[];
}

export function isAutoModelRequest(model?: string): boolean {
  return typeof model !== "string" || model.trim() === "" || model === "*" || model === "auto";
}

export function isExplicitAutoModelRequest(model?: string): boolean {
  return typeof model === "string" && (model.trim() === "auto" || model.trim() === "*");
}

export function readRoutingMiddlewareProfile(
  metadata: Record<string, JsonValue> | undefined,
): string | undefined {
  const model = metadata?.model;
  if (typeof model === "string" && model.trim().length > 0) {
    return model.trim();
  }

  const profile = metadata?.classification;
  return typeof profile === "string" && profile.trim().length > 0
    ? profile.trim()
    : undefined;
}

export function listConcreteKnownModels(
  backend: AiClientModelRuntime,
): Array<Pick<KnownModel, "id" | "source">> {
  if (!backend.config.enabled || !backend.healthy) {
    return [];
  }

  const discovered = collectConcreteDiscoveredModelIds(backend);
  if (hasDiscoveredModels(backend)) {
    return discovered.map((id) => ({
      id,
      source: "discovered",
    }));
  }

  return collectConcreteConfiguredModelIds(backend)
    .map((id) => ({
      id,
      source: "configured",
    }));
}

export function listAutomaticModelsForRuntime(backend: AiClientModelRuntime): string[] {
  const discovered = collectConcreteDiscoveredModelIds(backend);
  if (discovered.length > 0) {
    return discovered;
  }

  if (hasDiscoveredModels(backend)) {
    return [];
  }

  return collectConcreteConfiguredModelIds(backend);
}

export function backendSupportsRequestedModel(
  backend: AiClientModelRuntime,
  model?: string,
): boolean {
  return resolveModelForRuntime(backend, model) !== undefined;
}

export function resolveModelForRuntime(
  backend: AiClientModelRuntime,
  model?: string,
): string | undefined {
  if (isAutoModelRequest(model)) {
    const automaticModel = pickAutomaticBackendModel(backend);
    if (!automaticModel) {
      return undefined;
    }

    const configuredPatterns = backend.config.models ?? [];
    if (configuredPatterns.length === 0) {
      return automaticModel;
    }

    return configuredPatterns.some((pattern) => matchesPattern(pattern, automaticModel))
      ? automaticModel
      : undefined;
  }

  if (typeof model !== "string") {
    return undefined;
  }

  const configuredPatterns = backend.config.models ?? [];
  const discoveredModel = resolveDiscoveredBackendModel(backend, model);

  if (hasDiscoveredModels(backend)) {
    if (!discoveredModel) {
      return undefined;
    }

    if (configuredPatterns.length === 0) {
      return discoveredModel;
    }

    return configuredPatterns.some((pattern) => matchesPattern(pattern, model) || matchesPattern(pattern, discoveredModel))
      ? discoveredModel
      : undefined;
  }

  if (configuredPatterns.length === 0) {
    return model;
  }

  return configuredPatterns.some((pattern) => matchesPattern(pattern, model))
    ? model
    : undefined;
}

export async function tryExtractDiscoveredModels(
  response: Response,
  fallback: DiscoveredModelDetail[],
): Promise<DiscoveredModelDetail[]> {
  try {
    const body = await response.json() as {
      data?: unknown;
      models?: unknown;
    };
    const discovered = new Map<string, DiscoveredModelDetail>();

    for (const entry of fallback) {
      if (typeof entry?.id === "string" && entry.id.length > 0) {
        discovered.set(entry.id, entry);
      }
    }

    let foundModel = false;

    if (Array.isArray(body.data)) {
      for (const entry of body.data) {
        const modelId = readDiscoveredModelId(entry);
        if (!modelId) {
          continue;
        }

        foundModel = true;
        const previous = discovered.get(modelId);
        discovered.set(modelId, {
          id: modelId,
          metadata: mergeModelMetadata(previous?.metadata, normalizeModelMetadata(entry, modelId)),
        });
      }
    }

    if (Array.isArray(body.models)) {
      for (const entry of body.models) {
        const modelId = readDiscoveredModelId(entry);
        if (!modelId) {
          continue;
        }

        foundModel = true;
        const previous = discovered.get(modelId);
        discovered.set(modelId, {
          id: modelId,
          metadata: mergeModelMetadata(previous?.metadata, normalizeModelMetadata(entry, modelId)),
        });
      }
    }

    if (!foundModel) {
      return fallback;
    }

    return Array.from(discovered.values());
  } catch {
    return fallback;
  }
}

function matchesPattern(pattern: string, value: string): boolean {
  if (pattern === "*") {
    return true;
  }

  if (pattern.includes("*")) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    return new RegExp(`^${escaped}$`).test(value);
  }

  return pattern === value;
}

function hasDiscoveredModels(backend: AiClientModelRuntime): boolean {
  return backend.discoveredModels.length > 0 || backend.discoveredModelDetails.length > 0;
}

function collectConcreteDiscoveredModelIds(backend: AiClientModelRuntime): string[] {
  const discovered = new Set<string>();
  const configuredPatterns = backend.config.models ?? [];

  for (const detail of backend.discoveredModelDetails) {
    if (
      typeof detail.id === "string" &&
      detail.id.length > 0 &&
      !detail.id.includes("*") &&
      matchesConfiguredPatterns(configuredPatterns, detail.id)
    ) {
      discovered.add(detail.id);
    }
  }

  for (const model of backend.discoveredModels) {
    if (model.length > 0 && !model.includes("*") && matchesConfiguredPatterns(configuredPatterns, model)) {
      discovered.add(model);
    }
  }

  return Array.from(discovered);
}

function collectConcreteConfiguredModelIds(backend: AiClientModelRuntime): string[] {
  return (backend.config.models ?? [])
    .filter((model) => model.length > 0 && !model.includes("*"));
}

function pickAutomaticBackendModel(backend: AiClientModelRuntime): string | undefined {
  const discovered = collectConcreteDiscoveredModelIds(backend);
  if (discovered.length > 0) {
    return discovered[0];
  }

  if (hasDiscoveredModels(backend)) {
    return undefined;
  }

  const configured = collectConcreteConfiguredModelIds(backend);
  if (configured.length > 0) {
    return configured[0];
  }

  return undefined;
}

function resolveDiscoveredBackendModel(
  backend: AiClientModelRuntime,
  requestedModel: string,
): string | undefined {
  for (const detail of backend.discoveredModelDetails) {
    if (detail.id === requestedModel) {
      return detail.id;
    }

    for (const alias of extractModelAliases(detail.metadata)) {
      if (alias === requestedModel) {
        return detail.id;
      }
    }
  }

  if (backend.discoveredModels.includes(requestedModel)) {
    return requestedModel;
  }

  return undefined;
}

function extractModelAliases(metadata: JsonValue | undefined): string[] {
  if (!isJsonObject(metadata)) {
    return [];
  }

  if (!Array.isArray(metadata.aliases)) {
    return [];
  }

  return metadata.aliases
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

function matchesConfiguredPatterns(patterns: string[], model: string): boolean {
  if (patterns.length === 0) {
    return true;
  }

  return patterns.some((pattern) => matchesPattern(pattern, model));
}

function readDiscoveredModelId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.id === "string" && value.id.length > 0) {
    return value.id;
  }

  if (typeof value.model === "string" && value.model.length > 0) {
    return value.model;
  }

  if (typeof value.name === "string" && value.name.length > 0) {
    return value.name;
  }

  return undefined;
}

function normalizeModelMetadata(value: unknown, modelId: string): JsonValue | undefined {
  const normalized = normalizeJsonValue(value);

  if (isJsonObject(normalized)) {
    return compactJsonForRetention({
      id: modelId,
      ...normalized,
    });
  }

  if (normalized === undefined) {
    return undefined;
  }

  return compactJsonForRetention({
    id: modelId,
    value: normalized,
  });
}

function mergeModelMetadata(left: JsonValue | undefined, right: JsonValue | undefined): JsonValue | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  if (isJsonObject(left) && isJsonObject(right)) {
    return compactJsonForRetention({
      ...left,
      ...right,
    });
  }

  return right;
}

function normalizeJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((entry) => normalizeJsonValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);
    return items;
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, entry]) => {
        const normalized = normalizeJsonValue(entry);
        return normalized === undefined ? undefined : [key, normalized] as const;
      })
      .filter((entry): entry is readonly [string, JsonValue] => Boolean(entry));

    return Object.fromEntries(entries);
  }

  return undefined;
}

function isJsonObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
