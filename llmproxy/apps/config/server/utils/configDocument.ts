import { configUtils, type ConfigUtils } from "./configUtils";

export interface ConfigDocumentStore<TValue> {
  readonly configPath: string;
  load: () => Promise<TValue>;
  save: (value: TValue) => void;
}

export interface ConfigDocumentStoreOptions<TInput, TValue> {
  packageName: string;
  config?: {
    utils: ConfigUtils;
  };
  utils?: ConfigUtils;
  normalize: (input: TInput | undefined, configPath: string) => TValue;
  serialize: (value: TValue) => unknown;
}

export function createConfigDocumentStore<TInput, TValue>(
  options: ConfigDocumentStoreOptions<TInput, TValue>,
): ConfigDocumentStore<TValue> {
  const utils = options.config?.utils ?? options.utils ?? configUtils;
  const configPath = utils.resolveConfigFilePath(options.packageName);

  return {
    configPath,
    load: async () => {
      const parsed = utils.readConfig<TInput>(options.packageName);
      const normalized = options.normalize(parsed, configPath);

      if (parsed === undefined) {
        utils.writeConfigFile(options.packageName, options.serialize(normalized));
      }

      return normalized;
    },
    save: (value) => {
      utils.writeConfigFile(options.packageName, options.serialize(value));
    },
  };
}
