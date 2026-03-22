import fs from "node:fs";
import path from "node:path";

export const configFileName = "config.json";

export function resolveDataDir(baseDir = process.env.DATA_DIR, cwd = process.cwd()): string {
  return path.resolve(cwd, baseDir ?? ".data");
}

export function resolveConfigDirPath(packageName: string, baseDir = process.env.DATA_DIR, cwd = process.cwd()): string {
  return path.resolve(resolveDataDir(baseDir, cwd), "config", packageName);
}

export function resolvePublicPath(packageName: string, baseDir = process.env.DATA_DIR, cwd = process.cwd()): string {
  return path.resolve(resolveDataDir(baseDir, cwd), "public", packageName);
}

export function resolveConfigFilePath(
  packageName: string,
  filename = configFileName,
  baseDir = process.env.DATA_DIR,
  cwd = process.cwd(),
): string {
  return path.resolve(resolveConfigDirPath(packageName, baseDir, cwd), filename);
}

export function resolveAndCreateConfigFilePath(
  packageName: string,
  filename = configFileName,
  baseDir = process.env.DATA_DIR,
  cwd = process.cwd(),
): string {
  const configFilePath = resolveConfigFilePath(packageName, filename, baseDir, cwd);
  fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
  return configFilePath;
}

export function readConfig<T = unknown>(
  packageName: string,
  filename = configFileName,
  baseDir = process.env.DATA_DIR,
  cwd = process.cwd(),
): T | undefined {
  const configPath = resolveConfigFilePath(packageName, filename, baseDir, cwd);
  if (!fs.existsSync(configPath)) {
    return undefined;
  }

  const text = fs.readFileSync(configPath, "utf8");
  try {
    return text.length > 0 ? JSON.parse(text) as T : undefined;
  } catch (error) {
    console.error(`Failed to parse config "${configPath}":`, error);
    return undefined;
  }
}

export function writeConfigFile(
  packageName: string,
  data: unknown,
  filename = configFileName,
  baseDir = process.env.DATA_DIR,
  cwd = process.cwd(),
): void {
  const configPath = resolveAndCreateConfigFilePath(packageName, filename, baseDir, cwd);
  fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export const configUtils = {
  configFileName,
  resolveDataDir,
  resolveConfigDirPath,
  resolvePublicPath,
  resolveConfigFilePath,
  resolveAndCreateConfigFilePath,
  readConfig,
  writeConfigFile,
};

export type ConfigUtils = typeof configUtils;
