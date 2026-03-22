import { isJsonSchemaRecord, resolveLocalJsonSchemaNode } from "./json-schema-ref";

function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatSchemaNoteValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  try {
    const json = JSON.stringify(value);
    if (typeof json === "string" && json.length > 0) {
      return json.length > 140 ? `${json.slice(0, 137)}...` : json;
    }
  } catch {
    // Ignore serialization failures and fall through to the generic string cast.
  }

  return String(value);
}

function resolveDisplaySchema(
  rootSchema: unknown,
  schema: unknown,
): Record<string, unknown> | null {
  if (!isJsonSchemaRecord(rootSchema)) {
    return null;
  }

  return resolveLocalJsonSchemaNode(rootSchema, schema);
}

export interface JsonSchemaObjectShape {
  properties: Array<[string, unknown]>;
  requiredNames: Set<string>;
  allowsAdditionalProperties: boolean;
}

export function getJsonSchemaTypeLabel(rootSchema: unknown, schema: unknown): string {
  const resolvedSchema = resolveDisplaySchema(rootSchema, schema);
  if (!resolvedSchema) {
    return "value";
  }

  if (typeof resolvedSchema.type === "string" && resolvedSchema.type.trim()) {
    return resolvedSchema.type.trim();
  }

  if (Array.isArray(resolvedSchema.type)) {
    const labels = resolvedSchema.type.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (labels.length > 0) {
      return labels.join(" | ");
    }
  }

  if (Array.isArray(resolvedSchema.enum) && resolvedSchema.enum.length > 0) {
    return "enum";
  }

  if (Array.isArray(resolvedSchema.oneOf) && resolvedSchema.oneOf.length > 0) {
    return pluralize(resolvedSchema.oneOf.length, "variant");
  }

  if (Array.isArray(resolvedSchema.anyOf) && resolvedSchema.anyOf.length > 0) {
    return pluralize(resolvedSchema.anyOf.length, "option");
  }

  return "value";
}

export function getJsonSchemaNotes(rootSchema: unknown, schema: unknown): string[] {
  const resolvedSchema = resolveDisplaySchema(rootSchema, schema);
  if (!resolvedSchema) {
    return [];
  }

  const notes: string[] = [];

  if (typeof resolvedSchema.format === "string" && resolvedSchema.format.trim()) {
    notes.push(`format ${resolvedSchema.format.trim()}`);
  }

  if (Array.isArray(resolvedSchema.enum) && resolvedSchema.enum.length > 0) {
    const values = resolvedSchema.enum
      .slice(0, 4)
      .map((item) => formatSchemaNoteValue(item))
      .filter((value) => value.length > 0);

    if (values.length > 0) {
      const suffix = resolvedSchema.enum.length > values.length ? ", ..." : "";
      notes.push(`one of ${values.join(", ")}${suffix}`);
    }
  }

  if (typeof resolvedSchema.minLength === "number") {
    notes.push(`min length ${resolvedSchema.minLength}`);
  }

  if (typeof resolvedSchema.maxLength === "number") {
    notes.push(`max length ${resolvedSchema.maxLength}`);
  }

  if (typeof resolvedSchema.minimum === "number") {
    notes.push(`min ${resolvedSchema.minimum}`);
  }

  if (typeof resolvedSchema.maximum === "number") {
    notes.push(`max ${resolvedSchema.maximum}`);
  }

  if (typeof resolvedSchema.minItems === "number") {
    notes.push(`min items ${resolvedSchema.minItems}`);
  }

  if (typeof resolvedSchema.maxItems === "number") {
    notes.push(`max items ${resolvedSchema.maxItems}`);
  }

  const itemSchema = resolveDisplaySchema(rootSchema, resolvedSchema.items);
  if (resolvedSchema.type === "array" && itemSchema) {
    notes.push(`items ${getJsonSchemaTypeLabel(rootSchema, itemSchema)}`);
  }

  if (resolvedSchema.type === "object" && isJsonSchemaRecord(resolvedSchema.properties)) {
    notes.push(`${pluralize(Object.keys(resolvedSchema.properties).length, "field")}`);
  }

  return notes;
}

export function getJsonSchemaObjectShape(
  rootSchema: unknown,
  schema: unknown,
): JsonSchemaObjectShape | null {
  const resolvedSchema = resolveDisplaySchema(rootSchema, schema);
  if (!resolvedSchema) {
    return null;
  }

  const properties = isJsonSchemaRecord(resolvedSchema.properties)
    ? Object.entries(resolvedSchema.properties)
    : [];
  const requiredNames = new Set(
    Array.isArray(resolvedSchema.required)
      ? resolvedSchema.required.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [],
  );

  return {
    properties,
    requiredNames,
    allowsAdditionalProperties: resolvedSchema.additionalProperties !== false,
  };
}
