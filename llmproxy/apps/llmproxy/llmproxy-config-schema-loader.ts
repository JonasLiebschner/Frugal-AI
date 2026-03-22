import type { ConfigSchemaDocument } from "./app/types/dashboard";
import { fetchWithTimeout } from "./llmproxy-http";

const CONFIG_SCHEMA_TIMEOUT_MS = 4000;

interface ConfigSchemaResponse {
  properties?: Record<string, unknown>;
}

function isConfigSchemaResponse(value: unknown): value is ConfigSchemaResponse {
  return Boolean(value) && typeof value === "object";
}

function isSchemaDocument(value: unknown): value is ConfigSchemaDocument {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function fetchConfigSchemas(
  packageNames: string[],
  fetchImpl: typeof fetch = fetch,
  timeoutMs = CONFIG_SCHEMA_TIMEOUT_MS,
): Promise<Partial<Record<string, ConfigSchemaDocument>>> {
  const uniquePackageNames = Array.from(new Set(
    packageNames
      .map((packageName) => packageName.trim())
      .filter((packageName) => packageName.length > 0),
  ));

  if (uniquePackageNames.length === 0) {
    return {};
  }

  const params = new URLSearchParams();
  params.set("packages", uniquePackageNames.join(" "));

  try {
    const response = await fetchWithTimeout(`/api/config/schema?${params.toString()}`, {
      cache: "no-store",
      timeoutMs,
    }, fetchImpl);
    if (!response.ok) {
      return {};
    }

    const payload = await response.json() as unknown;
    const properties = isConfigSchemaResponse(payload) && payload.properties ? payload.properties : {};
    const schemas: Partial<Record<string, ConfigSchemaDocument>> = {};

    for (const packageName of uniquePackageNames) {
      const schema = properties[packageName];
      if (isSchemaDocument(schema)) {
        schemas[packageName] = schema;
      }
    }

    return schemas;
  } catch {
    return {};
  }
}

export function createConfigSchemaLoadCoordinator(
  getCachedSchema: (packageName: string) => ConfigSchemaDocument | undefined,
  onLoaded: (schemas: Partial<Record<string, ConfigSchemaDocument>>) => void,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = CONFIG_SCHEMA_TIMEOUT_MS,
) {
  const pendingPackageNames = new Set<string>();

  return async function loadConfigSchemas(packageNames: string[]): Promise<void> {
    const uniquePackageNames = Array.from(new Set(
      packageNames
        .map((packageName) => packageName.trim())
        .filter((packageName) => packageName.length > 0),
    ));
    const packageNamesToLoad = uniquePackageNames.filter((packageName) => (
      !getCachedSchema(packageName) && !pendingPackageNames.has(packageName)
    ));

    if (packageNamesToLoad.length === 0) {
      return;
    }

    for (const packageName of packageNamesToLoad) {
      pendingPackageNames.add(packageName);
    }

    try {
      const schemas = await fetchConfigSchemas(packageNamesToLoad, fetchImpl, timeoutMs);
      onLoaded(schemas);
    } finally {
      for (const packageName of packageNamesToLoad) {
        pendingPackageNames.delete(packageName);
      }
    }
  };
}
