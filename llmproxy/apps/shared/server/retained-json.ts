import type { JsonValue } from "../type-api";

const RETAINED_STRING_LIMIT = 16_000;
const RETAINED_MAX_DEPTH = 16;
const RETAINED_ARRAY_LIMIT = 24;
const RETAINED_OBJECT_KEY_LIMIT = 64;
const RETAINED_TRUNCATION_MARKER = "\n...[proxy truncated to reduce memory usage]";
const RETAINED_NESTED_MARKER = "[proxy truncated nested data]";
const RETAINED_TRUNCATED_KEYS_FIELD = "__proxy_truncated_keys__";

function cloneJsonInner(value: JsonValue): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonInner(entry));
  }

  const clone: Record<string, JsonValue> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    clone[key] = cloneJsonInner(nestedValue);
  }

  return clone;
}

function truncateRetainedString(value: string): string {
  if (value.length <= RETAINED_STRING_LIMIT) {
    return value;
  }

  const sliceLength = Math.max(0, RETAINED_STRING_LIMIT - RETAINED_TRUNCATION_MARKER.length);
  return `${value.slice(0, sliceLength)}${RETAINED_TRUNCATION_MARKER}`;
}

function compactJsonInner(value: JsonValue, depth: number): JsonValue {
  if (typeof value === "string") {
    return truncateRetainedString(value);
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= RETAINED_MAX_DEPTH) {
    return RETAINED_NESTED_MARKER;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, RETAINED_ARRAY_LIMIT)
      .map((entry) => compactJsonInner(entry, depth + 1));
  }

  const compacted: Record<string, JsonValue> = {};
  const entries = Object.entries(value);
  for (const [key, nestedValue] of entries.slice(0, RETAINED_OBJECT_KEY_LIMIT)) {
    compacted[key] = compactJsonInner(nestedValue, depth + 1);
  }

  if (entries.length > RETAINED_OBJECT_KEY_LIMIT) {
    compacted[RETAINED_TRUNCATED_KEYS_FIELD] = entries.length - RETAINED_OBJECT_KEY_LIMIT;
  }

  return compacted;
}

export function cloneJsonForRetention(value: JsonValue | undefined): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return cloneJsonInner(value);
}

export function compactJsonForRetention(value: JsonValue | undefined): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return compactJsonInner(value, 0);
}
