import { isPositiveInteger } from "../../shared/server/core-utils";
import { isRecord } from "../../shared/server/type-guards";
import type { OtelConfig } from "./otel-types";

export const DEFAULT_OTEL_CONFIG: OtelConfig = {
  enabled: false,
  timeoutMs: 10_000,
  serviceName: "llmproxy",
  captureMessageContent: false,
  captureToolContent: false,
};

const OTEL_CONFIG_KEYS = new Set([
  "enabled",
  "endpoint",
  "headers",
  "timeoutMs",
  "serviceName",
  "serviceNamespace",
  "deploymentEnvironment",
  "captureMessageContent",
  "captureToolContent",
]);

export function normalizeOtelConfig(
  config: unknown,
  configPath = "OTel config",
): OtelConfig {
  assertSupportedRootProperties(config, configPath);
  const record = isRecord(config) ? config : {};

  return {
    enabled: record.enabled === true,
    endpoint: readOptionalString(record.endpoint),
    headers: normalizeHeaders(record.headers),
    timeoutMs: isPositiveInteger(record.timeoutMs)
      ? record.timeoutMs
      : DEFAULT_OTEL_CONFIG.timeoutMs,
    serviceName: readNonEmptyString(record.serviceName) ?? DEFAULT_OTEL_CONFIG.serviceName,
    serviceNamespace: readOptionalString(record.serviceNamespace),
    deploymentEnvironment: readOptionalString(record.deploymentEnvironment),
    captureMessageContent: record.captureMessageContent === true,
    captureToolContent: record.captureToolContent === true,
  };
}

export function serializeOtelConfig(
  config: OtelConfig,
): OtelConfig {
  return {
    enabled: config.enabled,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.headers && Object.keys(config.headers).length > 0
      ? { headers: { ...config.headers } }
      : {}),
    timeoutMs: config.timeoutMs,
    serviceName: config.serviceName,
    ...(config.serviceNamespace ? { serviceNamespace: config.serviceNamespace } : {}),
    ...(config.deploymentEnvironment ? { deploymentEnvironment: config.deploymentEnvironment } : {}),
    captureMessageContent: config.captureMessageContent,
    captureToolContent: config.captureToolContent,
  };
}

function assertSupportedRootProperties(config: unknown, configPath: string): void {
  if (!isRecord(config)) {
    return;
  }

  const unsupportedKeys = Object.keys(config).filter((key) => !OTEL_CONFIG_KEYS.has(key));
  if (unsupportedKeys.length === 0) {
    return;
  }

  throw new Error(
    `Unsupported root properties in ${configPath}: ${unsupportedKeys.sort().join(", ")}.`,
  );
}

function normalizeHeaders(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const headers = Object.entries(value).reduce<Record<string, string>>((result, [key, entry]) => {
    if (typeof entry === "string" && entry.trim().length > 0) {
      result[key] = entry;
    }

    return result;
  }, {});

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return readNonEmptyString(value);
}
