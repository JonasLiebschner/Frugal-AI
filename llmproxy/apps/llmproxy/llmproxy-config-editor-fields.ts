import {
  getJsonSchemaFieldBooleanDefault,
  getJsonSchemaFieldMeta,
  getJsonSchemaFieldNumberDefault,
  getJsonSchemaFieldStringDefault,
} from "../json-schema/json-schema-client";
import type {
  AiRequestMiddlewareEditorFields,
  BackendEditorFields,
  ConfigSchemaDocument,
  EditableAiClientSettings,
  EditableAiRequestRoutingMiddleware,
  EditableOtelConfig,
  OtelEditorFields,
  ServerEditorFields,
} from "./app/types/dashboard";

function resolveFieldMeta(
  configSchema: ConfigSchemaDocument | null | undefined,
  pathSegments: readonly string[],
) {
  return getJsonSchemaFieldMeta(configSchema, pathSegments);
}

export function createDefaultBackendEditorFields(
  configSchema?: ConfigSchemaDocument | null,
): BackendEditorFields {
  return {
    id: "",
    name: "",
    baseUrl: "",
    connector: (getJsonSchemaFieldStringDefault(resolveFieldMeta(configSchema, ["connections", "*", "connector"])) ?? "openai") as BackendEditorFields["connector"],
    enabled: getJsonSchemaFieldBooleanDefault(resolveFieldMeta(configSchema, ["connections", "*", "enabled"])) ?? true,
    maxConcurrency: String(getJsonSchemaFieldNumberDefault(resolveFieldMeta(configSchema, ["connections", "*", "maxConcurrency"])) ?? 1),
    healthPath: "",
    modelsText: "*",
    headersText: "",
    apiKey: "",
    apiKeyEnv: "",
    clearApiKey: false,
    timeoutMs: "",
    monitoringTimeoutMs: "",
    monitoringIntervalMs: "",
    energyUsageUrl: "",
  };
}

export function isDefaultBackendEditorFields(
  fields: BackendEditorFields,
  configSchema?: ConfigSchemaDocument | null,
): boolean {
  const defaults = createDefaultBackendEditorFields(configSchema);

  return fields.id === defaults.id
    && fields.name === defaults.name
    && fields.baseUrl === defaults.baseUrl
    && fields.connector === defaults.connector
    && fields.enabled === defaults.enabled
    && fields.maxConcurrency === defaults.maxConcurrency
    && fields.healthPath === defaults.healthPath
    && fields.modelsText === defaults.modelsText
    && fields.headersText === defaults.headersText
    && fields.apiKey === defaults.apiKey
    && fields.apiKeyEnv === defaults.apiKeyEnv
    && fields.clearApiKey === defaults.clearApiKey
    && fields.timeoutMs === defaults.timeoutMs
    && fields.monitoringTimeoutMs === defaults.monitoringTimeoutMs
    && fields.monitoringIntervalMs === defaults.monitoringIntervalMs
    && fields.energyUsageUrl === defaults.energyUsageUrl;
}

export function createServerEditorFields(
  config?: EditableAiClientSettings | null,
  configSchema?: ConfigSchemaDocument | null,
): ServerEditorFields {
  return {
    requestTimeoutMs: config
      ? String(config.requestTimeoutMs)
      : String(getJsonSchemaFieldNumberDefault(resolveFieldMeta(configSchema, ["requestTimeoutMs"])) ?? ""),
    queueTimeoutMs: config
      ? String(config.queueTimeoutMs)
      : String(getJsonSchemaFieldNumberDefault(resolveFieldMeta(configSchema, ["queueTimeoutMs"])) ?? ""),
    healthCheckIntervalMs: config
      ? String(config.healthCheckIntervalMs)
      : String(getJsonSchemaFieldNumberDefault(resolveFieldMeta(configSchema, ["healthCheckIntervalMs"])) ?? ""),
    recentRequestLimit: config
      ? String(config.recentRequestLimit)
      : String(getJsonSchemaFieldNumberDefault(resolveFieldMeta(configSchema, ["recentRequestLimit"])) ?? ""),
  };
}

export function createOtelEditorFields(
  config?: EditableOtelConfig | null,
  configSchema?: ConfigSchemaDocument | null,
): OtelEditorFields {
  return {
    enabled: config
      ? config.enabled
      : getJsonSchemaFieldBooleanDefault(resolveFieldMeta(configSchema, ["enabled"])) ?? false,
    endpoint: config?.endpoint
      ?? getJsonSchemaFieldStringDefault(resolveFieldMeta(configSchema, ["endpoint"]))
      ?? "",
    headersText: "",
    clearHeaders: false,
    timeoutMs: config
      ? String(config.timeoutMs)
      : String(getJsonSchemaFieldNumberDefault(resolveFieldMeta(configSchema, ["timeoutMs"])) ?? ""),
    serviceName: config?.serviceName
      ?? getJsonSchemaFieldStringDefault(resolveFieldMeta(configSchema, ["serviceName"]))
      ?? "",
    serviceNamespace: config?.serviceNamespace
      ?? getJsonSchemaFieldStringDefault(resolveFieldMeta(configSchema, ["serviceNamespace"]))
      ?? "",
    deploymentEnvironment: config?.deploymentEnvironment
      ?? getJsonSchemaFieldStringDefault(resolveFieldMeta(configSchema, ["deploymentEnvironment"]))
      ?? "",
    captureMessageContent: config
      ? config.captureMessageContent
      : getJsonSchemaFieldBooleanDefault(resolveFieldMeta(configSchema, ["captureMessageContent"])) ?? false,
    captureToolContent: config
      ? config.captureToolContent
      : getJsonSchemaFieldBooleanDefault(resolveFieldMeta(configSchema, ["captureToolContent"])) ?? false,
  };
}

export function createAiRequestMiddlewareEditorFields(
  config?: EditableAiRequestRoutingMiddleware | null,
): AiRequestMiddlewareEditorFields {
  return {
    id: config?.id ?? "",
    url: config?.url ?? "",
    smallModel: config?.models.small ?? "",
    largeModel: config?.models.large ?? "",
  };
}
