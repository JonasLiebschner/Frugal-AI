import assert from "node:assert/strict";
import test from "node:test";

import { createAiAgentsTestRegistry } from "./runtime-api";

test("ai-agents registry starts empty until provider apps register prompts", () => {
  const registry = createAiAgentsTestRegistry();

  const services = registry.getServices(async () => {
    throw new Error("not used in this test");
  });

  assert.equal(services.length, 0);
});
