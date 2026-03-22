export const noStoreRoutePatterns = [
  "/api/llmproxy/**",
  "/healthz",
  "/mcp",
  "/mcp/manifest",
  "/v1/**",
] as const;

export const llmproxyNitroRouteRules = Object.fromEntries(
  noStoreRoutePatterns.map((pattern) => [
    pattern,
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  ]),
);

export function matchesRoutePattern(pathname: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }

  return pathname === pattern;
}
