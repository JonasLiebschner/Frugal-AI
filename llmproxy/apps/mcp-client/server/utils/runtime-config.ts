import type { ExternalMcpServerDefinition } from "../mcp-client-types";
import { isRecord } from "../../../shared/server/type-guards";

const DEFAULT_TRANSPORT = "streamable-http";

export function normalizeConfiguredMcpServers(
  input: unknown,
  source = "mcp-client runtime config",
): ExternalMcpServerDefinition[] {
  if (input === undefined || input === null) {
    return [];
  }

  if (!Array.isArray(input)) {
    throw new Error(`"${source}" must be an array of external MCP server definitions.`);
  }

  const configuredServers: ExternalMcpServerDefinition[] = [];
  const ids = new Set<string>();

  for (let index = 0; index < input.length; index += 1) {
    const server = normalizeConfiguredMcpServer(input[index], `${source}[${index}]`);
    if (ids.has(server.id)) {
      throw new Error(`Duplicate external MCP server id "${server.id}" in ${source}.`);
    }

    ids.add(server.id);
    configuredServers.push(server);
  }

  return configuredServers;
}

function normalizeConfiguredMcpServer(
  input: unknown,
  source: string,
): ExternalMcpServerDefinition {
  if (!isRecord(input)) {
    throw new Error(`"${source}" must be an object.`);
  }

  const id = normalizeRequiredString(input.id, `${source}.id`);
  const title = normalizeRequiredString(input.title, `${source}.title`);
  const endpoint = normalizeRequiredString(input.endpoint, `${source}.endpoint`);
  const description = normalizeOptionalString(input.description);
  const protocolVersion = normalizeOptionalString(input.protocolVersion);
  const transport = normalizeTransport(input.transport, `${source}.transport`);
  const headers = normalizeHeaders(input.headers, `${source}.headers`);

  return {
    id,
    title,
    endpoint,
    transport,
    ...(description ? { description } : {}),
    ...(protocolVersion ? { protocolVersion } : {}),
    ...(headers ? { headers } : {}),
  };
}

function normalizeRequiredString(value: unknown, source: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`"${source}" must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizeTransport(
  value: unknown,
  source: string,
): ExternalMcpServerDefinition["transport"] {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_TRANSPORT;
  }

  if (value !== DEFAULT_TRANSPORT) {
    throw new Error(`"${source}" must be "${DEFAULT_TRANSPORT}".`);
  }

  return DEFAULT_TRANSPORT;
}

function normalizeHeaders(
  value: unknown,
  source: string,
): Record<string, string> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error(`"${source}" must be an object of string values.`);
  }

  const headers: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new Error(`"${source}.${key}" must be a non-empty string.`);
    }

    const normalizedKey = key.trim();
    if (!normalizedKey) {
      throw new Error(`"${source}" contains an empty header name.`);
    }

    headers[normalizedKey] = entry.trim();
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}
