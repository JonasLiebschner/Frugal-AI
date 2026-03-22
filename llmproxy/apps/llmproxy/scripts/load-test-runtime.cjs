const path = require("node:path");
const { pathToFileURL } = require("node:url");

const appRoot = path.resolve(__dirname, "..");

async function importAppModule(relativePath) {
  const moduleUrl = pathToFileURL(path.join(appRoot, relativePath)).href;
  return await import(moduleUrl);
}

async function loadTestRuntime() {
  const {
    NitroTestServer,
    createLlmproxyTestRuntimeDependencies,
  } = await importAppModule("test/runtime-api.ts");

  return {
    NitroTestServer,
    createLlmproxyTestRuntimeDependencies,
  };
}

module.exports = {
  loadTestRuntime,
};
