import assert from "node:assert/strict";
import test from "node:test";

import { createAjvTestValidationService } from "../../ajv/test/runtime-api";
import type { RequestFetch } from "../../shared/server/request-fetch";
import { createToolRegistryTestRegistry } from "../../tool-registry/test/runtime-api";
import { aiProxyToolRegistryToolProviders } from "../server/ai-proxy-capability";

test("built-in ai-proxy tool providers register via the tool-registry app", () => {
  const registry = createToolRegistryTestRegistry<RequestFetch>({
    validation: createAjvTestValidationService(),
  });

  registry.registerTool(aiProxyToolRegistryToolProviders);
  registry.registerTool(aiProxyToolRegistryToolProviders);

  const services = registry.getServices(async () => {
    throw new Error("not used in this test");
  });

  assert.equal(services.length, 1);
  assert.deepEqual(
    services[0]?.definition.tools.map((tool) => tool.name).sort(),
    [
      "chat_with_model",
      "diagnose_request",
      "get_request_detail",
      "list_models",
      "list_requests",
    ],
  );
});
