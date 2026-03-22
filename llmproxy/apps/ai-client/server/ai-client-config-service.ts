import {
  createAppConfigStore,
} from "../../config/server/config-capability";
import {
  materializeConnectionConfig,
  normalizeAiClientConfig,
  normalizeAiClientSettings,
  serializeAiClientConfig,
  toConnectionEditorConfig,
} from "./ai-client-config";
import type {
  ConnectionEditorConfig,
  ConnectionPatch,
  ConnectionSavePayload,
  AiClientConfig,
} from "../../shared/type-api";
import type { AiClientConfigService, AiClientConfigServiceOptions } from "./ai-client-config-types";

export function createAiClientConfigService(
  options: AiClientConfigServiceOptions = {},
): AiClientConfigService {
  const document = createAppConfigStore<Partial<AiClientConfig>, AiClientConfig>({
    packageName: "ai-client",
    config: options.config,
    utils: options.utils,
    normalize: (parsed, configPath) => normalizeAiClientConfig(parsed ?? {}, configPath),
    serialize: serializeAiClientConfig,
  });
  const { configPath } = document;

  async function loadConfig(): Promise<AiClientConfig> {
    return await document.load();
  }

  return {
    configPath,
    load: loadConfig,
    updateConnection: async (id, patch) => {
      const current = await loadConfig();
      const connection = current.connections.find((entry) => entry.id === id);

      if (!connection) {
        throw new Error(`Connection "${id}" was not found in ${configPath}.`);
      }

      if (patch.enabled !== undefined) {
        connection.enabled = patch.enabled;
      }

      if (patch.maxConcurrency !== undefined) {
        connection.maxConcurrency = patch.maxConcurrency;
      }

      const next = normalizeAiClientConfig(current, configPath);
      document.save(next);
      return next;
    },
    updateAiClientSettings: async (settings) => {
      const current = await loadConfig();
      current.requestTimeoutMs = settings.requestTimeoutMs;
      current.queueTimeoutMs = settings.queueTimeoutMs;
      current.healthCheckIntervalMs = settings.healthCheckIntervalMs;
      current.recentRequestLimit = settings.recentRequestLimit;

      const next = normalizeAiClientConfig(current, configPath);
      document.save(next);
      return next;
    },
    listEditableConnections: async () => {
      const current = await loadConfig();
      return current.connections.map(toConnectionEditorConfig);
    },
    loadEditableConfig: async () => {
      const current = await loadConfig();
      return {
        requestTimeoutMs: current.requestTimeoutMs,
        queueTimeoutMs: current.queueTimeoutMs,
        healthCheckIntervalMs: current.healthCheckIntervalMs,
        recentRequestLimit: current.recentRequestLimit,
        connections: current.connections.map(toConnectionEditorConfig),
      };
    },
    createConnection: async (payload) => {
      const current = await loadConfig();
      const candidate = materializeConnectionConfig(undefined, payload);
      current.connections.push(candidate);

      const next = normalizeAiClientConfig(current, configPath);
      document.save(next);

      const createdConnection = next.connections.find((connection) => connection.id === candidate.id);
      if (!createdConnection) {
        throw new Error(`Connection "${candidate.id}" could not be created in ${configPath}.`);
      }

      return {
        config: next,
        connection: toConnectionEditorConfig(createdConnection),
      };
    },
    replaceConnection: async (currentId, payload) => {
      const current = await loadConfig();
      const connectionIndex = current.connections.findIndex((entry) => entry.id === currentId);

      if (connectionIndex < 0) {
        throw new Error(`Connection "${currentId}" was not found in ${configPath}.`);
      }

      const candidate = materializeConnectionConfig(current.connections[connectionIndex], payload);
      current.connections.splice(connectionIndex, 1, candidate);

      const next = normalizeAiClientConfig(current, configPath);
      document.save(next);

      const updatedConnection = next.connections.find((connection) => connection.id === candidate.id);
      if (!updatedConnection) {
        throw new Error(`Connection "${candidate.id}" could not be updated in ${configPath}.`);
      }

      return {
        config: next,
        connection: toConnectionEditorConfig(updatedConnection),
      };
    },
    deleteConnection: async (id) => {
      const current = await loadConfig();
      const connectionIndex = current.connections.findIndex((entry) => entry.id === id);

      if (connectionIndex < 0) {
        throw new Error(`Connection "${id}" was not found in ${configPath}.`);
      }

      current.connections.splice(connectionIndex, 1);

      const next = normalizeAiClientConfig(current, configPath);
      document.save(next);
      return next;
    },
  };
}
