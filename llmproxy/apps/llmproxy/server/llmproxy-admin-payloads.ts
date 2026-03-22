import type {
  ConnectionSavePayload,
  McpClientServerSavePayload,
  AiClientConfig,
  AiClientSettings,
} from "../../shared/type-api";
import type { AiRequestRoutingMiddlewareSavePayload } from "../../ai-request-middleware/server/ai-request-middleware-capability";
import { isPositiveInteger } from "../../shared/server/core-utils";

export function parseAiClientSettingsSavePayload(input: Record<string, unknown>): AiClientSettings {
  return {
    requestTimeoutMs: parseRequiredPositiveInteger(input.requestTimeoutMs, "requestTimeoutMs"),
    queueTimeoutMs: parseRequiredPositiveInteger(input.queueTimeoutMs, "queueTimeoutMs"),
    healthCheckIntervalMs: parseRequiredPositiveInteger(input.healthCheckIntervalMs, "healthCheckIntervalMs"),
    recentRequestLimit: parseRequiredPositiveInteger(input.recentRequestLimit, "recentRequestLimit"),
  };
}

export function parseOtelConfigSavePayload(input: Record<string, unknown>): {
  enabled: boolean;
  endpoint?: string;
  headers?: Record<string, string>;
  clearHeaders?: boolean;
  timeoutMs: number;
  serviceName: string;
  serviceNamespace?: string;
  deploymentEnvironment?: string;
  captureMessageContent: boolean;
  captureToolContent: boolean;
} {
  return {
    enabled: parseRequiredBoolean(input.enabled, "enabled"),
    endpoint: parseOptionalTrimmedString(input.endpoint, "endpoint"),
    headers: parseOptionalStringRecord(input.headers, "headers"),
    clearHeaders: parseOptionalBoolean(input.clearHeaders, "clearHeaders"),
    timeoutMs: parseRequiredPositiveInteger(input.timeoutMs, "timeoutMs"),
    serviceName: parseRequiredTrimmedString(input.serviceName, "serviceName"),
    serviceNamespace: parseOptionalTrimmedString(input.serviceNamespace, "serviceNamespace"),
    deploymentEnvironment: parseOptionalTrimmedString(input.deploymentEnvironment, "deploymentEnvironment"),
    captureMessageContent: parseRequiredBoolean(input.captureMessageContent, "captureMessageContent"),
    captureToolContent: parseRequiredBoolean(input.captureToolContent, "captureToolContent"),
  };
}

export function findChangedServerFields(current: AiClientSettings, next: AiClientSettings): Array<keyof AiClientSettings> {
  const changedFields: Array<keyof AiClientSettings> = [];

  for (const field of Object.keys(next) as Array<keyof AiClientSettings>) {
    if (current[field] !== next[field]) {
      changedFields.push(field);
    }
  }

  return changedFields;
}

export function parseConnectionSavePayload(input: Record<string, unknown>): ConnectionSavePayload {
  const id = parseRequiredTrimmedString(input.id, "id");
  const name = parseRequiredTrimmedString(input.name, "name");
  const baseUrl = parseRequiredTrimmedString(input.baseUrl, "baseUrl");
  const connector = parseBackendConnector(input.connector);
  const enabled = parseRequiredBoolean(input.enabled, "enabled");
  const maxConcurrency = parseRequiredPositiveInteger(input.maxConcurrency, "maxConcurrency");
  const healthPath = parseOptionalTrimmedString(input.healthPath, "healthPath");
  const models = parseOptionalStringArray(input.models, "models");
  const headers = parseOptionalStringRecord(input.headers, "headers");
  const apiKey = parseOptionalTrimmedString(input.apiKey, "apiKey");
  const apiKeyEnv = parseOptionalTrimmedString(input.apiKeyEnv, "apiKeyEnv");
  const clearApiKey = parseOptionalBoolean(input.clearApiKey, "clearApiKey");
  const timeoutMs = parseOptionalPositiveInteger(input.timeoutMs, "timeoutMs");
  const monitoringTimeoutMs = parseOptionalPositiveInteger(input.monitoringTimeoutMs, "monitoringTimeoutMs");
  const monitoringIntervalMs = parseOptionalPositiveInteger(input.monitoringIntervalMs, "monitoringIntervalMs");
  const energyUsageUrl = parseOptionalTrimmedString(input.energyUsageUrl, "energyUsageUrl");

  return {
    id,
    name,
    baseUrl,
    connector,
    enabled,
    maxConcurrency,
    healthPath,
    models,
    headers,
    apiKey,
    apiKeyEnv,
    clearApiKey,
    timeoutMs,
    monitoringTimeoutMs,
    monitoringIntervalMs,
    energyUsageUrl,
  };
}

export function parseMcpClientServerSavePayload(
  input: Record<string, unknown>,
): McpClientServerSavePayload {
  return {
    id: parseRequiredTrimmedString(input.id, "id"),
    title: parseRequiredTrimmedString(input.title, "title"),
    endpoint: parseRequiredTrimmedString(input.endpoint, "endpoint"),
    description: parseOptionalTrimmedString(input.description, "description"),
    transport: parseMcpTransport(input.transport),
    protocolVersion: parseOptionalTrimmedString(input.protocolVersion, "protocolVersion"),
    headers: parseOptionalStringRecord(input.headers, "headers"),
  };
}

export function parseAiRequestRoutingMiddlewareSavePayload(
  input: Record<string, unknown>,
): AiRequestRoutingMiddlewareSavePayload {
  return {
    id: parseRequiredTrimmedString(input.id, "id"),
    url: parseRequiredTrimmedString(input.url, "url"),
    models: parseRequiredMiddlewareModelMap(input.models),
  };
}

function parseRequiredMiddlewareModelMap(value: unknown): { small: string; large: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("\"models\" must be an object.");
  }

  const record = value as Record<string, unknown>;
  return {
    small: parseRequiredTrimmedString(record.small, "models.small"),
    large: parseRequiredTrimmedString(record.large, "models.large"),
  };
}

function parseOptionalTrimmedString(value: unknown, fieldName: string): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`"${fieldName}" must be a string when provided.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseRequiredTrimmedString(value: unknown, fieldName: string): string {
  const trimmed = parseOptionalTrimmedString(value, fieldName);
  if (!trimmed) {
    throw new Error(`"${fieldName}" must be a non-empty string.`);
  }

  return trimmed;
}

function parseRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`"${fieldName}" must be a boolean.`);
  }

  return value;
}

function parseOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`"${fieldName}" must be a boolean when provided.`);
  }

  return value;
}

function parseRequiredPositiveInteger(value: unknown, fieldName: string): number {
  if (!isPositiveInteger(value)) {
    throw new Error(`"${fieldName}" must be a positive integer.`);
  }

  return value;
}

function parseOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (!isPositiveInteger(value)) {
    throw new Error(`"${fieldName}" must be a positive integer when provided.`);
  }

  return value;
}


function parseOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`"${fieldName}" must be an array of strings when provided.`);
  }

  const normalized = value
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function parseOptionalStringRecord(value: unknown, fieldName: string): Record<string, string> | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`"${fieldName}" must be an object of string values when provided.`);
  }

  const entries = Object.entries(value);
  const record: Record<string, string> = {};

  for (const [key, entryValue] of entries) {
    if (typeof entryValue !== "string") {
      throw new Error(`"${fieldName}.${key}" must be a string.`);
    }

    const normalizedKey = key.trim();
    const normalizedValue = entryValue.trim();
    if (!normalizedKey || !normalizedValue) {
      continue;
    }

    record[normalizedKey] = normalizedValue;
  }

  return Object.keys(record).length > 0 ? record : undefined;
}

function parseBackendConnector(value: unknown): "openai" | "ollama" | "llama.cpp" {
  if (value === undefined || value === null || value === "openai") {
    return "openai";
  }

  if (value === "ollama") {
    return "ollama";
  }

  if (value === "llama.cpp") {
    return "llama.cpp";
  }

  throw new Error('"connector" must be "openai", "ollama", or "llama.cpp".');
}

function parseMcpTransport(value: unknown): "streamable-http" {
  if (value === undefined || value === null || value === "streamable-http") {
    return "streamable-http";
  }

  throw new Error('"transport" must be "streamable-http".');
}
