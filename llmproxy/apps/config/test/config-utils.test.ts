import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveConfigFilePath } from "../server/config-capability";

test("resolveConfigFilePath defaults to .data under the provided working directory", () => {
  const workspacePath = path.join("tmp", "workspace-root");

  assert.equal(
    resolveConfigFilePath("llmproxy", undefined, undefined, workspacePath),
    path.resolve(workspacePath, ".data", "config", "llmproxy", "config.json"),
  );
});

test("resolveConfigFilePath honors DATA_DIR as the base directory when provided", () => {
  const workspacePath = path.join("tmp", "workspace-root");
  const dataDirPath = path.resolve("tmp", "llmproxy-data");

  assert.equal(
    resolveConfigFilePath("llmproxy", undefined, dataDirPath, workspacePath),
    path.resolve(dataDirPath, "config", "llmproxy", "config.json"),
  );
});
