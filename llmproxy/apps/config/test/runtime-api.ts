import fs from "node:fs";
import path from "node:path";

import type { TestLayerRuntime } from "../../shared/test/test-layer-runtime";
import { createRouteBundleTestRuntime } from "../../shared/test/test-layer-runtime";
import { setEventContextValue } from "../../shared/server/event-context";
import { createStandaloneAjvService } from "../../ajv/server/ajv-capability";
import {
  createConfigService,
} from "../server/config-capability";
import type {
  AppConfigSchemaDefinition,
  ConfigService,
  ConfigUtils,
} from "../server/config-capability";
import { configTestRouteBundle } from "./route-bundle";

export interface ConfigTestServiceOptions {
  configFilePaths?: Record<string, string>;
  schemas?: Record<string, unknown>;
}

export interface ConfigTestRuntime extends TestLayerRuntime {
  config: ConfigService;
}

export function createConfigTestUtils(
  options: ConfigTestServiceOptions = {},
): ConfigUtils {
  const defaultConfig = createConfigService();
  const configFilePaths = new Map(Object.entries(options.configFilePaths ?? {}));

  function resolveMappedConfigFilePath(
    packageName: string,
    filename = defaultConfig.configFileName,
    baseDir = process.env.DATA_DIR,
    cwd = process.cwd(),
  ): string {
    const mappedPath = configFilePaths.get(packageName);
    if (mappedPath) {
      return path.resolve(mappedPath);
    }

    return defaultConfig.resolveConfigFilePath(packageName, filename, baseDir, cwd);
  }

  return {
    configFileName: defaultConfig.configFileName,
    resolveDataDir: defaultConfig.resolveDataDir,
    resolveConfigDirPath: (packageName, baseDir, cwd) => {
      const mappedPath = configFilePaths.get(packageName);
      return mappedPath
        ? path.dirname(path.resolve(mappedPath))
        : defaultConfig.resolveConfigDirPath(packageName, baseDir, cwd);
    },
    resolvePublicPath: defaultConfig.resolvePublicPath,
    resolveConfigFilePath: resolveMappedConfigFilePath,
    resolveAndCreateConfigFilePath: (packageName, filename, baseDir, cwd) => {
      const filePath = resolveMappedConfigFilePath(packageName, filename, baseDir, cwd);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      return filePath;
    },
    readConfig: <T = unknown>(packageName: string, filename?: string, baseDir?: string, cwd?: string) => {
      const filePath = resolveMappedConfigFilePath(packageName, filename, baseDir, cwd);
      if (!fs.existsSync(filePath)) {
        return undefined;
      }

      const text = fs.readFileSync(filePath, "utf8");
      try {
        return text.length > 0 ? JSON.parse(text) as T : undefined;
      } catch (error) {
        console.error(`Failed to parse config "${filePath}":`, error);
        return undefined;
      }
    },
    writeConfigFile: (packageName, data, filename, baseDir, cwd) => {
      const filePath = resolveMappedConfigFilePath(packageName, filename, baseDir, cwd);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    },
  };
}

export function createConfigTestService(
  options: ConfigTestServiceOptions = {},
): ConfigService {
  const config = createConfigService(
    createConfigTestUtils(options),
    undefined,
    createStandaloneAjvService(),
  );

  for (const definition of listConfigTestSchemas(options)) {
    config.registerSchema(definition);
  }

  return config;
}

export function createConfigTestRuntime(
  options: ConfigTestServiceOptions = {},
): ConfigTestRuntime {
  const config = createConfigTestService(options);

  return createRouteBundleTestRuntime(
    { config },
    configTestRouteBundle,
    (event) => {
      setEventContextValue(event, "config", config);
    },
  );
}

function listConfigTestSchemas(
  options: ConfigTestServiceOptions,
): AppConfigSchemaDefinition[] {
  return Object.entries(options.schemas ?? {}).map(([id, schema]) => ({
    id,
    schema,
  }));
}
