import assert from "node:assert/strict";
import test from "node:test";
import { createSseService } from "../server/sse-capability";

test("registerHandler registers topics once per provider", () => {
  const service = createSseService();
  let calls = 0;

  const provider = () => {
    calls += 1;
    return [
      {
        id: "dashboard",
        title: "Dashboard",
      },
    ];
  };

  service.registerHandler(provider);
  service.registerHandler(provider);

  assert.equal(calls, 1);
  assert.deepEqual(service.listTopics(), [
    {
      id: "dashboard",
      title: "Dashboard",
    },
  ]);
});
