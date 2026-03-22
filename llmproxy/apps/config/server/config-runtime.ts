import {
  createConfigDocumentStore,
} from "./utils/configDocument";
import { configUtils } from "./utils/configUtils";
import {
  listJsonSchemaAccessViolations,
  projectJsonSchemaValue,
  type JsonSchemaAccessMode,
  type JsonSchemaValidationService,
} from "../../json-schema/server/json-schema-capability";
import type {
  AppConfigSchemaDefinition,
  AppConfigStore,
  AppConfigStoreOptions,
  ConfigService,
  ConfigSchemaRegistrySource,
  ConfigUtils,
} from "./config-types";

function createInMemoryConfigSchemaRegistry(): ConfigSchemaRegistrySource {
  const schemas = new Map<string, AppConfigSchemaDefinition>();

  return {
    register: (definitions) => {
      const normalizedDefinitions = Array.isArray(definitions)
        ? definitions
        : [definitions];

      for (const definition of normalizedDefinitions) {
        schemas.set(definition.id, definition);
      }

      return normalizedDefinitions;
    },
    get: (packageName) => schemas.get(packageName),
    list: () => Array.from(schemas.values()),
  };
}

export function createConfigService(
  utils: ConfigUtils = configUtils,
  schemas: ConfigSchemaRegistrySource = createInMemoryConfigSchemaRegistry(),
  validation?: JsonSchemaValidationService,
): ConfigService {
  return {
    configFileName: utils.configFileName,
    validation,
    resolveDataDir: utils.resolveDataDir,
    resolveConfigDirPath: utils.resolveConfigDirPath,
    resolvePublicPath: utils.resolvePublicPath,
    resolveConfigFilePath: utils.resolveConfigFilePath,
    resolveAndCreateConfigFilePath: utils.resolveAndCreateConfigFilePath,
    readConfig: utils.readConfig,
    readPublicConfig: <T = unknown>(packageName: string, filename?: string, baseDir?: string, cwd?: string) => {
      const value = utils.readConfig<T>(packageName, filename, baseDir, cwd);
      if (value === undefined) {
        return undefined;
      }

      return projectJsonSchemaValue(
        schemas.get(packageName)?.schema,
        value,
        "read",
      );
    },
    projectConfigValue: <T = unknown>(packageName: string, value: T, mode: JsonSchemaAccessMode) => projectJsonSchemaValue(
      schemas.get(packageName)?.schema,
      value,
      mode,
    ),
    listConfigAccessViolations: (packageName, value, mode) => listJsonSchemaAccessViolations(
      schemas.get(packageName)?.schema,
      value,
      mode,
    ),
    writeConfigFile: utils.writeConfigFile,
    registerSchema: schemas.register,
    getSchema: schemas.get,
    listSchemas: schemas.list,
    createStore: (options) => createConfigDocumentStore({
      ...options,
      utils,
    }),
  };
}

export function createAppConfigStore<TInput, TValue>(
  options: AppConfigStoreOptions<TInput, TValue>,
): AppConfigStore<TValue> {
  const { config, utils, ...storeOptions } = options;

  if (config) {
    return config.createStore(storeOptions);
  }

  return createConfigDocumentStore({
    ...storeOptions,
    utils,
  });
}

const defaultConfigService = createConfigService();

export const resolveConfigDirPath = defaultConfigService.resolveConfigDirPath;
export const resolveConfigFilePath = defaultConfigService.resolveConfigFilePath;
export const resolveAndCreateConfigFilePath = defaultConfigService.resolveAndCreateConfigFilePath;
