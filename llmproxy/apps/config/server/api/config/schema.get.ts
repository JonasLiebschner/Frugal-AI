import { defineEventHandler, getQuery } from "h3";

function parsePackages(input: unknown): string[] {
  return Array.from(new Set(
    String(input ?? "")
      .split(" ")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  ));
}

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const packageNames = parsePackages(query.packages);
  const properties: Record<string, unknown> = {};

  if (packageNames.length === 0) {
    for (const definition of event.context.config.listSchemas()) {
      properties[definition.id] = definition.schema;
    }
  } else {
    for (const packageName of packageNames) {
      const schema = event.context.config.getSchema(packageName)?.schema;
      if (schema !== undefined) {
        properties[packageName] = schema;
      }
    }
  }

  return {
    type: "object",
    properties,
  };
});
