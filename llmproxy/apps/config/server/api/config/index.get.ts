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
  const result: Record<string, unknown> = {};

  for (const packageName of packageNames) {
    const config = event.context.config.readPublicConfig(packageName);
    if (config !== undefined) {
      result[packageName] = config;
    }
  }

  return result;
});
