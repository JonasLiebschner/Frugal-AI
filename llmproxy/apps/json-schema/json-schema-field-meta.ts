import { isJsonSchemaRecord, resolveLocalJsonSchemaNode } from "./json-schema-ref";

function isRequiredProperty(schema: Record<string, unknown>, propertyName: string): boolean {
  return Array.isArray(schema.required) && schema.required.includes(propertyName);
}

function resolveNextSchema(
  rootSchema: Record<string, unknown>,
  schema: Record<string, unknown>,
  segment: string,
): { schema: Record<string, unknown>; required: boolean } | null {
  if (segment === "*") {
    const itemSchema = resolveLocalJsonSchemaNode(rootSchema, schema.items);
    return itemSchema
      ? { schema: itemSchema, required: false }
      : null;
  }

  if (!isJsonSchemaRecord(schema.properties)) {
    return null;
  }

  const nextSchema = resolveLocalJsonSchemaNode(rootSchema, schema.properties[segment]);
  if (!nextSchema) {
    return null;
  }

  return {
    schema: nextSchema,
    required: isRequiredProperty(schema, segment),
  };
}

export interface JsonSchemaFieldMeta {
  path: string;
  required: boolean;
  readOnly: boolean;
  writeOnly: boolean;
  deprecated: boolean;
  title?: string;
  description?: string;
  defaultValue?: unknown;
  examples?: readonly unknown[];
}

export type JsonSchemaFieldPathMap = Record<string, readonly string[]>;

export type JsonSchemaFieldMetaMap<TPathMap extends JsonSchemaFieldPathMap> = {
  [TKey in keyof TPathMap]: JsonSchemaFieldMeta | null;
};

export function getJsonSchemaFieldMeta(
  rootSchema: unknown,
  pathSegments: readonly string[],
): JsonSchemaFieldMeta | null {
  if (!isJsonSchemaRecord(rootSchema)) {
    return null;
  }

  let currentSchema: Record<string, unknown> = resolveLocalJsonSchemaNode(rootSchema, rootSchema) ?? rootSchema;
  let required = false;

  for (const segment of pathSegments) {
    const next = resolveNextSchema(rootSchema, currentSchema, segment);
    if (!next) {
      return null;
    }

    currentSchema = next.schema;
    required = next.required;
  }

  return {
    path: pathSegments.join("."),
    required,
    readOnly: currentSchema.readOnly === true,
    writeOnly: currentSchema.writeOnly === true,
    deprecated: currentSchema.deprecated === true,
    title: typeof currentSchema.title === "string" ? currentSchema.title : undefined,
    description: typeof currentSchema.description === "string" ? currentSchema.description : undefined,
    defaultValue: currentSchema.default,
    examples: Array.isArray(currentSchema.examples) ? currentSchema.examples : undefined,
  };
}

export function getJsonSchemaFieldMetaMap<TPathMap extends JsonSchemaFieldPathMap>(
  rootSchema: unknown,
  pathMap: TPathMap,
): JsonSchemaFieldMetaMap<TPathMap> {
  const entries = Object.entries(pathMap).map(([key, pathSegments]) => [
    key,
    getJsonSchemaFieldMeta(rootSchema, pathSegments),
  ]);

  return Object.fromEntries(entries) as JsonSchemaFieldMetaMap<TPathMap>;
}

export function getJsonSchemaFieldLabel(
  fieldMeta: JsonSchemaFieldMeta | null | undefined,
  fallback: string,
): string {
  return typeof fieldMeta?.title === "string" && fieldMeta.title.trim().length > 0
    ? fieldMeta.title
    : fallback;
}

export function getJsonSchemaFieldExampleText(
  fieldMeta: JsonSchemaFieldMeta | null | undefined,
): string | undefined {
  const example = fieldMeta?.examples?.find((value) => (
    typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ));

  return example !== undefined ? String(example) : undefined;
}

export function getJsonSchemaFieldJsonExampleText(
  fieldMeta: JsonSchemaFieldMeta | null | undefined,
): string | undefined {
  const example = fieldMeta?.examples?.[0];
  if (example === undefined) {
    return undefined;
  }

  if (typeof example === "string" || typeof example === "number" || typeof example === "boolean") {
    return String(example);
  }

  if (Array.isArray(example) || (example !== null && typeof example === "object")) {
    return JSON.stringify(example, null, 2);
  }

  return undefined;
}

export function getJsonSchemaFieldLineListExampleText(
  fieldMeta: JsonSchemaFieldMeta | null | undefined,
): string | undefined {
  const example = fieldMeta?.examples?.find((value) => Array.isArray(value));
  if (!Array.isArray(example)) {
    return undefined;
  }

  const values = example.filter((value): value is string | number | boolean => (
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
  ));

  return values.length > 0 ? values.map((value) => String(value)).join("\n") : undefined;
}

export function getJsonSchemaFieldStringDefault(
  fieldMeta: JsonSchemaFieldMeta | null | undefined,
): string | undefined {
  return typeof fieldMeta?.defaultValue === "string" && fieldMeta.defaultValue.length > 0
    ? fieldMeta.defaultValue
    : undefined;
}

export function getJsonSchemaFieldNumberDefault(
  fieldMeta: JsonSchemaFieldMeta | null | undefined,
): number | undefined {
  return typeof fieldMeta?.defaultValue === "number" && Number.isFinite(fieldMeta.defaultValue)
    ? fieldMeta.defaultValue
    : undefined;
}

export function getJsonSchemaFieldBooleanDefault(
  fieldMeta: JsonSchemaFieldMeta | null | undefined,
): boolean | undefined {
  return typeof fieldMeta?.defaultValue === "boolean"
    ? fieldMeta.defaultValue
    : undefined;
}
