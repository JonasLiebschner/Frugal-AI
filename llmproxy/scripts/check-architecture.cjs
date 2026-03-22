const fs = require("node:fs");
const path = require("node:path");

const rootDir = process.cwd();
const appsDir = path.join(rootDir, "apps");
const sourceFileExtensions = new Set([
  ".ts",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
  ".vue",
]);
const ignoredDirNames = new Set([
  "node_modules",
  ".git",
  ".nuxt",
  ".output",
  "dist",
  "coverage",
]);
const crossAppInternalPattern = /\/server\/(services|utils)(\/|$)/;
const crossAppClientInternalPattern = /\/app\/(components|composables|utils)(\/|$)/;
const publicClientModulePattern = /^apps\/[^/]+\/[^/]+-client\.(?:[cm]?[jt]s)$/;
const importPattern = /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"'`]+)["']|import\(\s*["']([^"'`]+)["']\s*\)|require\(\s*["']([^"'`]+)["']\s*\)/g;
const pluginFilePattern = /\.(?:[cm]?[jt]s)$/;

function toPosixPath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function collectSourceFiles(dirPath, files = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (ignoredDirNames.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, files);
      continue;
    }

    if (sourceFileExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function findLineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function resolveImportTarget(sourceFilePath, specifier) {
  return toPosixPath(path.relative(
    rootDir,
    path.resolve(path.dirname(sourceFilePath), specifier),
  ));
}

function collectAppDirectories() {
  return fs.readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !ignoredDirNames.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function checkAppConfigSchemaContracts(violations) {
  for (const appName of collectAppDirectories()) {
    const appDir = path.join(appsDir, appName);
    const schemaPath = path.join(appDir, "config.schema.json");
    if (!fs.existsSync(schemaPath)) {
      violations.push({
        kind: "schema-file",
        app: appName,
        message: `apps/${appName}/config.schema.json is required.`,
      });
      continue;
    }

    const pluginsDir = path.join(appDir, "server", "plugins");
    if (!fs.existsSync(pluginsDir)) {
      violations.push({
        kind: "schema-plugin",
        app: appName,
        message: `apps/${appName}/server/plugins must register config.schema.json with createAppConfigSchemaRegistrar("${appName}", ...).`,
      });
      continue;
    }

    const pluginFiles = fs.readdirSync(pluginsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && pluginFilePattern.test(entry.name))
      .map((entry) => path.join(pluginsDir, entry.name));

    const registrarPattern = new RegExp(`createAppConfigSchemaRegistrar\\(\\s*["']${appName}["']`);
    const hasRegistrar = pluginFiles.some((pluginFilePath) => {
      const content = fs.readFileSync(pluginFilePath, "utf8");
      return registrarPattern.test(content);
    });

    if (!hasRegistrar) {
      violations.push({
        kind: "schema-plugin",
        app: appName,
        message: `apps/${appName}/server/plugins must register config.schema.json with createAppConfigSchemaRegistrar("${appName}", ...).`,
      });
    }
  }
}

function main() {
  const violations = [];
  const sourceFiles = collectSourceFiles(appsDir);

  for (const sourceFilePath of sourceFiles) {
    const relativeSourcePath = toPosixPath(path.relative(rootDir, sourceFilePath));
    const sourceAppMatch = relativeSourcePath.match(/^apps\/([^/]+)\//);
    if (!sourceAppMatch) {
      continue;
    }

    const sourceApp = sourceAppMatch[1];
    const content = fs.readFileSync(sourceFilePath, "utf8");

    for (const match of content.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (!specifier || !specifier.startsWith(".")) {
        continue;
      }

      const relativeTargetPath = resolveImportTarget(sourceFilePath, specifier);
      const targetAppMatch = relativeTargetPath.match(/^apps\/([^/]+)\//);
      if (!targetAppMatch) {
        continue;
      }

      const targetApp = targetAppMatch[1];
      if (targetApp === sourceApp || targetApp === "shared") {
        continue;
      }

      if (crossAppInternalPattern.test(relativeTargetPath)) {
        violations.push({
          kind: "cross-app-import",
          source: relativeSourcePath,
          target: relativeTargetPath,
          specifier,
          line: findLineNumber(content, match.index ?? 0),
          message: "Cross-app server internals must be imported through the owning app's public server surface.",
        });
        continue;
      }

      if (crossAppClientInternalPattern.test(relativeTargetPath) && !publicClientModulePattern.test(relativeTargetPath)) {
        violations.push({
          kind: "cross-app-import",
          source: relativeSourcePath,
          target: relativeTargetPath,
          specifier,
          line: findLineNumber(content, match.index ?? 0),
          message: "Cross-app client imports must use a top-level *-client.ts public surface instead of app internals.",
        });
      }
    }
  }

  checkAppConfigSchemaContracts(violations);

  if (violations.length === 0) {
    console.log("Architecture check passed.");
    return;
  }

  console.error("Architecture check failed.");
  for (const violation of violations) {
    if (violation.kind === "cross-app-import") {
      console.error(`- ${violation.source}:${violation.line} imports "${violation.specifier}" -> ${violation.target}`);
      if (violation.message) {
        console.error(`  ${violation.message}`);
      }
      continue;
    }

    console.error(`- ${violation.message}`);
  }

  process.exitCode = 1;
}

main();
