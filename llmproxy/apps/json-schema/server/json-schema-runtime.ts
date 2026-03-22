import type {
  AppConfigSchemaDefinition,
  AppConfigSchemaRegistrySource,
  JsonSchemaAccessMode,
  JsonSchemaAccessViolation,
  JsonSchemaValidationService,
} from "./json-schema-types";
import { isJsonSchemaRecord, resolveLocalJsonSchemaNode } from "../json-schema-ref";

export const appConfigSchemaRegistryName = "config:schemas";

export const jsonSchemaAnnotationKeywords = [
  "title",
  "description",
  "default",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
  "$comment",
  "contentEncoding",
  "contentMediaType",
] as const;

declare const useNitroApp: () => {
  $ajv?: JsonSchemaValidationService;
};

interface AppConfigSchemaPluginsService {
  registerItem: <TItem extends { id: string }>(
    registryName: string,
    items: TItem | TItem[],
  ) => TItem[];
  getItem: <TItem = { id: string }>(
    registryName: string,
    itemName: string,
  ) => TItem | undefined;
  getList: <TItem = { id: string }>(
    registryName: string,
  ) => TItem[];
}

interface NitroAppWithConfigSchemas {
  $plugins?: AppConfigSchemaPluginsService;
}

interface JsonSchemaLike {
  readOnly?: unknown;
  writeOnly?: unknown;
  properties?: Record<string, unknown>;
  patternProperties?: Record<string, unknown>;
  items?: unknown;
  prefixItems?: unknown[];
  additionalProperties?: unknown;
  allOf?: unknown[];
}

const OMIT = Symbol("omit-json-schema-value");

function requirePluginsService(
  nitroApp: NitroAppWithConfigSchemas,
): AppConfigSchemaPluginsService {
  const plugins = nitroApp.$plugins;
  if (!plugins) {
    throw new Error("Plugin registry is unavailable.");
  }

  return plugins;
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function appendInstancePath(basePath: string, segment: string | number): string {
  const encodedSegment = escapeJsonPointerSegment(String(segment));
  return `${basePath}/${encodedSegment}`;
}

function matchesPattern(pattern: string, key: string): boolean {
  try {
    return new RegExp(pattern, "u").test(key);
  } catch {
    return false;
  }
}

function getRestrictedKeyword(mode: JsonSchemaAccessMode): "readOnly" | "writeOnly" {
  return mode === "read" ? "writeOnly" : "readOnly";
}

function getApplicablePropertySchemas(
  schema: JsonSchemaLike,
  key: string,
): unknown[] {
  const schemas: unknown[] = [];
  let matched = false;

  if (schema.properties && Object.hasOwn(schema.properties, key)) {
    schemas.push(schema.properties[key]);
    matched = true;
  }

  if (isJsonSchemaRecord(schema.patternProperties)) {
    for (const [pattern, patternSchema] of Object.entries(schema.patternProperties)) {
      if (matchesPattern(pattern, key)) {
        schemas.push(patternSchema);
        matched = true;
      }
    }
  }

  if (!matched && isJsonSchemaRecord(schema.additionalProperties)) {
    schemas.push(schema.additionalProperties);
  }

  return schemas;
}

function getApplicableItemSchemas(
  schema: JsonSchemaLike,
  index: number,
): unknown[] {
  const schemas: unknown[] = [];
  if (Array.isArray(schema.prefixItems) && index < schema.prefixItems.length) {
    schemas.push(schema.prefixItems[index]);
  } else if (schema.items !== undefined) {
    schemas.push(schema.items);
  }

  return schemas;
}

function applyProjection(
  rootSchema: unknown,
  schema: unknown,
  value: unknown,
  mode: JsonSchemaAccessMode,
): unknown | typeof OMIT {
  const resolvedSchema = resolveLocalJsonSchemaNode(rootSchema, schema);
  if (!resolvedSchema) {
    if (Array.isArray(value)) {
      return value.slice();
    }

    if (isJsonSchemaRecord(value)) {
      return { ...value };
    }

    return value;
  }

  const typedSchema = resolvedSchema as JsonSchemaLike;
  if (typedSchema[getRestrictedKeyword(mode)] === true) {
    return OMIT;
  }

  let currentValue: unknown = value;
  if (Array.isArray(typedSchema.allOf)) {
    for (const branch of typedSchema.allOf) {
      currentValue = applyProjection(rootSchema, branch, currentValue, mode);
      if (currentValue === OMIT) {
        return OMIT;
      }
    }
  }

  if (Array.isArray(currentValue)) {
    const result: unknown[] = [];
    for (let index = 0; index < currentValue.length; index += 1) {
      let projectedEntry: unknown = currentValue[index];
      for (const itemSchema of getApplicableItemSchemas(typedSchema, index)) {
        projectedEntry = applyProjection(rootSchema, itemSchema, projectedEntry, mode);
        if (projectedEntry === OMIT) {
          break;
        }
      }

      if (projectedEntry !== OMIT) {
        result.push(projectedEntry);
      }
    }

    return result;
  }

  if (!isJsonSchemaRecord(currentValue)) {
    return currentValue;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(currentValue)) {
    let projectedEntry: unknown = entryValue;
    for (const propertySchema of getApplicablePropertySchemas(typedSchema, key)) {
      projectedEntry = applyProjection(rootSchema, propertySchema, projectedEntry, mode);
      if (projectedEntry === OMIT) {
        break;
      }
    }

    if (projectedEntry !== OMIT) {
      result[key] = projectedEntry;
    }
  }

  return result;
}

function collectAccessViolations(
  rootSchema: unknown,
  schema: unknown,
  value: unknown,
  mode: JsonSchemaAccessMode,
  instancePath: string,
  seen: Set<string>,
  violations: JsonSchemaAccessViolation[],
): void {
  const resolvedSchema = resolveLocalJsonSchemaNode(rootSchema, schema);
  if (!resolvedSchema) {
    return;
  }

  const typedSchema = resolvedSchema as JsonSchemaLike;
  const keyword = getRestrictedKeyword(mode);
  if (typedSchema[keyword] === true) {
    const key = `${keyword}:${instancePath}`;
    if (!seen.has(key)) {
      seen.add(key);
      violations.push({
        instancePath,
        keyword,
        message: `Field is marked as ${keyword}.`,
      });
    }
    return;
  }

  if (Array.isArray(typedSchema.allOf)) {
    for (const branch of typedSchema.allOf) {
      collectAccessViolations(rootSchema, branch, value, mode, instancePath, seen, violations);
    }
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      for (const itemSchema of getApplicableItemSchemas(typedSchema, index)) {
        collectAccessViolations(
          rootSchema,
          itemSchema,
          value[index],
          mode,
          appendInstancePath(instancePath, index),
          seen,
          violations,
        );
      }
    }

    return;
  }

  if (!isJsonSchemaRecord(value)) {
    return;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    for (const propertySchema of getApplicablePropertySchemas(typedSchema, key)) {
      collectAccessViolations(
        rootSchema,
        propertySchema,
        entryValue,
        mode,
        appendInstancePath(instancePath, key),
        seen,
        violations,
      );
    }
  }
}

export function useSchemaValidationService(): JsonSchemaValidationService {
  const validation = useNitroApp().$ajv;
  if (!validation) {
    throw new Error("JSON schema validation service is unavailable.");
  }

  return validation;
}

export function registerAppConfigSchema(
  nitroApp: NitroAppWithConfigSchemas,
  definitions: AppConfigSchemaDefinition | AppConfigSchemaDefinition[],
): AppConfigSchemaDefinition[] {
  return requirePluginsService(nitroApp).registerItem(
    appConfigSchemaRegistryName,
    definitions,
  );
}

export function getRegisteredAppConfigSchema(
  nitroApp: NitroAppWithConfigSchemas,
  packageName: string,
): AppConfigSchemaDefinition | undefined {
  return nitroApp.$plugins?.getItem<AppConfigSchemaDefinition>(
    appConfigSchemaRegistryName,
    packageName,
  );
}

export function listRegisteredAppConfigSchemas(
  nitroApp: NitroAppWithConfigSchemas,
): AppConfigSchemaDefinition[] {
  return nitroApp.$plugins?.getList<AppConfigSchemaDefinition>(
    appConfigSchemaRegistryName,
  ) ?? [];
}

export function createRegisteredAppConfigSchemaSource(
  nitroApp: NitroAppWithConfigSchemas,
): AppConfigSchemaRegistrySource {
  return {
    register: (definitions) => registerAppConfigSchema(nitroApp, definitions),
    get: (packageName) => getRegisteredAppConfigSchema(nitroApp, packageName),
    list: () => listRegisteredAppConfigSchemas(nitroApp),
  };
}

export function createAppConfigSchemaRegistrar(
  id: string,
  schema: unknown,
): (nitroApp: NitroAppWithConfigSchemas) => void {
  return (nitroApp) => {
    registerAppConfigSchema(nitroApp, {
      id,
      schema,
    });
  };
}

export function projectJsonSchemaValue<T = unknown>(
  schema: unknown,
  value: T,
  mode: JsonSchemaAccessMode,
): T {
  const projected = applyProjection(schema, schema, value, mode);
  return (projected === OMIT ? undefined : projected) as T;
}

export function redactWriteOnlyJsonSchemaFields<T = unknown>(
  schema: unknown,
  value: T,
): T {
  return projectJsonSchemaValue(schema, value, "read");
}

export function omitReadOnlyJsonSchemaFields<T = unknown>(
  schema: unknown,
  value: T,
): T {
  return projectJsonSchemaValue(schema, value, "write");
}

export function listJsonSchemaAccessViolations(
  schema: unknown,
  value: unknown,
  mode: JsonSchemaAccessMode,
): JsonSchemaAccessViolation[] {
  const violations: JsonSchemaAccessViolation[] = [];
  collectAccessViolations(schema, schema, value, mode, "", new Set(), violations);
  return violations;
}
