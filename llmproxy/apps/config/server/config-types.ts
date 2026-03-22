import type {
  ConfigDocumentStore,
  ConfigDocumentStoreOptions,
} from "./utils/configDocument";
import type { ConfigUtils } from "./utils/configUtils";
import type {
  AppConfigSchemaDefinition,
  JsonSchemaAccessMode,
  JsonSchemaAccessViolation,
  JsonSchemaValidationService,
} from "../../json-schema/server/json-schema-capability";

export interface ConfigSchemaRegistrySource {
  register: (
    definitions: AppConfigSchemaDefinition | AppConfigSchemaDefinition[],
  ) => AppConfigSchemaDefinition[];
  get: (packageName: string) => AppConfigSchemaDefinition | undefined;
  list: () => AppConfigSchemaDefinition[];
}

export interface ConfigService {
  readonly configFileName: ConfigUtils["configFileName"];
  readonly validation?: JsonSchemaValidationService;
  resolveDataDir: ConfigUtils["resolveDataDir"];
  resolveConfigDirPath: ConfigUtils["resolveConfigDirPath"];
  resolvePublicPath: ConfigUtils["resolvePublicPath"];
  resolveConfigFilePath: ConfigUtils["resolveConfigFilePath"];
  resolveAndCreateConfigFilePath: ConfigUtils["resolveAndCreateConfigFilePath"];
  readConfig: ConfigUtils["readConfig"];
  readPublicConfig: <T = unknown>(packageName: string, filename?: string, baseDir?: string, cwd?: string) => T | undefined;
  projectConfigValue: <T = unknown>(packageName: string, value: T, mode: JsonSchemaAccessMode) => T;
  listConfigAccessViolations: (packageName: string, value: unknown, mode: JsonSchemaAccessMode) => JsonSchemaAccessViolation[];
  writeConfigFile: ConfigUtils["writeConfigFile"];
  registerSchema: ConfigSchemaRegistrySource["register"];
  getSchema: ConfigSchemaRegistrySource["get"];
  listSchemas: ConfigSchemaRegistrySource["list"];
  createStore: <TInput, TValue>(
    options: Omit<ConfigDocumentStoreOptions<TInput, TValue>, "config" | "utils">,
  ) => ConfigDocumentStore<TValue>;
}

export type AppConfigStore<TValue> = ConfigDocumentStore<TValue>;

export interface AppConfigStoreOptions<TInput, TValue>
  extends Omit<ConfigDocumentStoreOptions<TInput, TValue>, "config" | "utils"> {
  config?: ConfigService;
  utils?: ConfigUtils;
}

export type {
  AppConfigSchemaDefinition,
  ConfigDocumentStore,
  ConfigDocumentStoreOptions,
  ConfigUtils,
};
