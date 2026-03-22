import assert from "node:assert/strict";
import test from "node:test";

import { createAiAgentsTestRegistry } from "../../ai-agents/test/runtime-api";
import { aiProxyPromptProviders } from "../server/ai-proxy-capability";

test("ai-proxy prompt providers register diagnostics prompts into ai-agents", () => {
  const registry = createAiAgentsTestRegistry();
  registry.registerPrompt(aiProxyPromptProviders);

  const services = registry.getServices(async () => {
    throw new Error("not used in this test");
  });

  assert.equal(services.length, 1);
  assert.equal(services[0]?.definition.id, "ai-proxy-diagnostics");
  assert.deepEqual(
    services[0]?.definition.prompts.map((prompt) => prompt.name),
    ["diagnose-request", "troubleshoot-max-tokens", "troubleshoot-repetition", "troubleshoot-routing"],
  );
  assert.equal(typeof services[0]?.getPrompt, "function");
});
