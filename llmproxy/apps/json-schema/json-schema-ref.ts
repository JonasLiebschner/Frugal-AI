export function isJsonSchemaRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolveLocalJsonPointer(rootSchema: unknown, ref: string): unknown {
  if (ref === "#") {
    return rootSchema;
  }

  if (!ref.startsWith("#/")) {
    return undefined;
  }

  let current: unknown = rootSchema;
  for (const rawSegment of ref.slice(2).split("/")) {
    if (!isJsonSchemaRecord(current)) {
      return undefined;
    }

    current = current[decodeJsonPointerSegment(rawSegment)];
  }

  return current;
}

export function resolveLocalJsonSchemaNode(
  rootSchema: unknown,
  schemaNode: unknown,
  seenRefs: Set<string> = new Set(),
): Record<string, unknown> | null {
  if (!isJsonSchemaRecord(schemaNode)) {
    return null;
  }

  let current: Record<string, unknown> = schemaNode;
  while (typeof current.$ref === "string") {
    const ref = current.$ref;
    if (seenRefs.has(ref)) {
      return null;
    }

    seenRefs.add(ref);
    const resolved = resolveLocalJsonPointer(rootSchema, ref);
    if (!isJsonSchemaRecord(resolved)) {
      return null;
    }

    const siblingKeywords = { ...current };
    delete siblingKeywords.$ref;
    current = Object.keys(siblingKeywords).length > 0
      ? { ...resolved, ...siblingKeywords }
      : resolved;
  }

  return current;
}

