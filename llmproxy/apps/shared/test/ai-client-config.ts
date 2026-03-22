import type {
  AiClientConfig,
  AiClientSettings,
  ConnectionConfig,
} from "../type-api";

export function createAiClientConfig(input: {
  settings: AiClientSettings;
  connections: ConnectionConfig[];
}): AiClientConfig {
  return {
    ...input.settings,
    connections: input.connections,
  };
}
