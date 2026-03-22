import type { BackendSnapshot, KnownModel, ProxySnapshot } from "../types/dashboard";

export function collectSnapshotModels(snapshot: ProxySnapshot): KnownModel[] {
  const models = new Map<string, KnownModel>();

  for (const backend of snapshot.backends) {
    if (!backend.enabled || !backend.healthy) {
      continue;
    }

    for (const model of listConcreteSnapshotModels(backend)) {
      if (!models.has(model)) {
        models.set(model, {
          id: model,
          ownedBy: backend.name,
        });
      }
    }
  }

  return Array.from(models.values()).sort((left, right) => left.id.localeCompare(right.id));
}

function listConcreteSnapshotModels(backend: BackendSnapshot): string[] {
  const discovered = new Set<string>();
  const configuredPatterns = backend.configuredModels;

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

  if (backend.discoveredModels.length > 0 || backend.discoveredModelDetails.length > 0) {
    return Array.from(discovered);
  }

  return backend.configuredModels.filter((model) => model.length > 0 && !model.includes("*"));
}

function matchesConfiguredPatterns(patterns: string[], model: string): boolean {
  if (patterns.length === 0) {
    return true;
  }

  return patterns.some((pattern) => matchesPattern(pattern, model));
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
