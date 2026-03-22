import {
  AiClientConfig,
  AiClientSettings,
  ConnectionConfig,
  BackendConnector,
  ConnectionEditorConfig,
  ConnectionSavePayload,
} from "../../shared/type-api";

export const DEFAULT_AI_CLIENT_SETTINGS: AiClientSettings = {
  requestTimeoutMs: 10 * 60 * 1000,
  queueTimeoutMs: 30 * 1000,
  healthCheckIntervalMs: 10 * 1000,
  recentRequestLimit: 1000,
};

const AI_CLIENT_CONFIG_ROOT_KEYS = new Set([
  "requestTimeoutMs",
  "queueTimeoutMs",
  "healthCheckIntervalMs",
  "recentRequestLimit",
  "connections",
]);

export function resolveConnectionHeaders(connection: ConnectionConfig): Record<string, string> {
  const headers: Record<string, string> = { ...(connection.headers ?? {}) };
  const apiKey = connection.apiKeyEnv ? process.env[connection.apiKeyEnv] ?? connection.apiKey : connection.apiKey;

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

export function normalizeAiClientConfig(
  config: Partial<AiClientConfig> | undefined,
  configPath: string,
): AiClientConfig {
  const parsedConfig = assertValidAiClientConfigShape(config, configPath);

  const settings = normalizeAiClientSettings(parsedConfig);
  const connections = Array.isArray(parsedConfig.connections)
    ? parsedConfig.connections.map(normalizeConnectionConfig)
    : [];
  const uniqueIds = new Set<string>();

  for (const connection of connections) {
    if (uniqueIds.has(connection.id)) {
      throw new Error(`Duplicate connection id "${connection.id}" in ${configPath}.`);
    }

    uniqueIds.add(connection.id);
  }

  return {
    ...settings,
    connections,
  };
}

export function normalizeAiClientSettings(config?: Partial<AiClientSettings>): AiClientSettings {
  return {
    requestTimeoutMs:
      typeof config?.requestTimeoutMs === "number" && config.requestTimeoutMs > 0
        ? config.requestTimeoutMs
        : DEFAULT_AI_CLIENT_SETTINGS.requestTimeoutMs,
    queueTimeoutMs:
      typeof config?.queueTimeoutMs === "number" && config.queueTimeoutMs > 0
        ? config.queueTimeoutMs
        : DEFAULT_AI_CLIENT_SETTINGS.queueTimeoutMs,
    healthCheckIntervalMs:
      typeof config?.healthCheckIntervalMs === "number" && config.healthCheckIntervalMs > 0
        ? config.healthCheckIntervalMs
        : DEFAULT_AI_CLIENT_SETTINGS.healthCheckIntervalMs,
    recentRequestLimit:
      typeof config?.recentRequestLimit === "number" && Number.isInteger(config.recentRequestLimit) && config.recentRequestLimit > 0
        ? config.recentRequestLimit
        : DEFAULT_AI_CLIENT_SETTINGS.recentRequestLimit,
  };
}

export function serializeAiClientConfig(config: AiClientConfig): Record<string, unknown> {
  return {
    requestTimeoutMs: config.requestTimeoutMs,
    queueTimeoutMs: config.queueTimeoutMs,
    healthCheckIntervalMs: config.healthCheckIntervalMs,
    recentRequestLimit: config.recentRequestLimit,
    connections: config.connections.map(serializeConnectionConfig),
  };
}

export function materializeConnectionConfig(
  current: ConnectionConfig | undefined,
  payload: ConnectionSavePayload,
): ConnectionConfig {
  const nextApiKey =
    payload.clearApiKey
      ? undefined
      : (typeof payload.apiKey === "string" && payload.apiKey.trim().length > 0
          ? payload.apiKey.trim()
          : current?.apiKey);

  return normalizeConnectionConfig({
    id: payload.id,
    name: payload.name,
    baseUrl: payload.baseUrl,
    connector: payload.connector,
    enabled: payload.enabled,
    maxConcurrency: payload.maxConcurrency,
    healthPath: payload.healthPath,
    models: payload.models,
    headers: payload.headers,
    apiKey: nextApiKey,
    apiKeyEnv: payload.apiKeyEnv,
    timeoutMs: payload.timeoutMs,
    monitoringTimeoutMs: payload.monitoringTimeoutMs,
    monitoringIntervalMs: payload.monitoringIntervalMs,
    energyUsageUrl: payload.energyUsageUrl,
  });
}

export function toConnectionEditorConfig(connection: ConnectionConfig): ConnectionEditorConfig {
  return {
    id: connection.id,
    name: connection.name,
    baseUrl: connection.baseUrl,
    connector: connection.connector === "ollama"
      ? "ollama"
      : connection.connector === "llama.cpp"
        ? "llama.cpp"
        : "openai",
    enabled: connection.enabled,
    maxConcurrency: connection.maxConcurrency,
    healthPath: connection.healthPath,
    models: connection.models ? [...connection.models] : undefined,
    headers: connection.headers ? { ...connection.headers } : undefined,
    apiKeyEnv: connection.apiKeyEnv,
    apiKeyConfigured: typeof connection.apiKey === "string" && connection.apiKey.length > 0,
    timeoutMs: connection.timeoutMs,
    monitoringTimeoutMs: connection.monitoringTimeoutMs,
    monitoringIntervalMs: connection.monitoringIntervalMs,
    energyUsageUrl: connection.energyUsageUrl,
  };
}

function normalizeConnectionConfig(config: Partial<ConnectionConfig>): ConnectionConfig {
  if (!config.id || typeof config.id !== "string") {
    throw new Error("Every connection requires a string id.");
  }

  if (!config.name || typeof config.name !== "string") {
    throw new Error(`Connection "${config.id}" requires a string name.`);
  }

  if (!config.baseUrl || typeof config.baseUrl !== "string") {
    throw new Error(`Connection "${config.id}" requires a string baseUrl.`);
  }

  return {
    id: config.id.trim(),
    name: config.name.trim(),
    baseUrl: config.baseUrl.trim().replace(/\/+$/, ""),
    connector: normalizeConnector(config.connector),
    enabled: config.enabled !== false,
    maxConcurrency:
      typeof config.maxConcurrency === "number" && Number.isInteger(config.maxConcurrency) && config.maxConcurrency > 0
        ? config.maxConcurrency
        : 1,
    healthPath:
      typeof config.healthPath === "string" && config.healthPath.trim().length > 0 ? config.healthPath.trim() : undefined,
    models: Array.isArray(config.models)
      ? config.models
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
      : undefined,
    headers:
      config.headers && typeof config.headers === "object"
        ? Object.fromEntries(
            Object.entries(config.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
          )
        : undefined,
    apiKey: typeof config.apiKey === "string" && config.apiKey.trim().length > 0 ? config.apiKey : undefined,
    apiKeyEnv: typeof config.apiKeyEnv === "string" && config.apiKeyEnv.trim().length > 0 ? config.apiKeyEnv : undefined,
    timeoutMs: typeof config.timeoutMs === "number" && config.timeoutMs > 0 ? config.timeoutMs : undefined,
    monitoringTimeoutMs:
      typeof config.monitoringTimeoutMs === "number" && config.monitoringTimeoutMs > 0
        ? config.monitoringTimeoutMs
        : undefined,
    monitoringIntervalMs:
      typeof config.monitoringIntervalMs === "number" && config.monitoringIntervalMs > 0
        ? config.monitoringIntervalMs
        : undefined,
    energyUsageUrl:
      typeof config.energyUsageUrl === "string" && config.energyUsageUrl.trim().length > 0
        ? config.energyUsageUrl.trim()
        : undefined,
  };
}

function assertValidAiClientConfigShape(
  config: Partial<AiClientConfig> | undefined,
  configPath: string,
): Partial<AiClientConfig> {
  if (config === undefined) {
    return {};
  }

  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Invalid ai-client config file ${configPath}. Expected a JSON object.`);
  }

  const unsupportedKeys = Object.keys(config).filter((key) => !AI_CLIENT_CONFIG_ROOT_KEYS.has(key));
  if (unsupportedKeys.length > 0) {
    throw new Error(
      `Invalid ai-client config file ${configPath}. Unsupported root properties: ${unsupportedKeys.map((key) => `"${key}"`).join(", ")}.`,
    );
  }

  return config;
}

function normalizeConnector(value: unknown): BackendConnector {
  if (value === "llama.cpp") {
    return "llama.cpp";
  }

  return value === "ollama" ? "ollama" : "openai";
}

function serializeConnectionConfig(connection: ConnectionConfig): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    id: connection.id,
    name: connection.name,
    baseUrl: connection.baseUrl,
    connector: connection.connector,
    enabled: connection.enabled,
    maxConcurrency: connection.maxConcurrency,
  };

  if (connection.healthPath) {
    serialized.healthPath = connection.healthPath;
  }

  if (connection.models && connection.models.length > 0) {
    serialized.models = [...connection.models];
  }

  if (connection.headers && Object.keys(connection.headers).length > 0) {
    serialized.headers = { ...connection.headers };
  }

  if (connection.apiKey) {
    serialized.apiKey = connection.apiKey;
  }

  if (connection.apiKeyEnv) {
    serialized.apiKeyEnv = connection.apiKeyEnv;
  }

  if (connection.timeoutMs) {
    serialized.timeoutMs = connection.timeoutMs;
  }

  if (connection.monitoringTimeoutMs) {
    serialized.monitoringTimeoutMs = connection.monitoringTimeoutMs;
  }

  if (connection.monitoringIntervalMs) {
    serialized.monitoringIntervalMs = connection.monitoringIntervalMs;
  }

  if (connection.energyUsageUrl) {
    serialized.energyUsageUrl = connection.energyUsageUrl;
  }

  return serialized;
}
