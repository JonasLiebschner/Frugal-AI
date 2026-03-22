import test from "node:test";
import assert from "node:assert/strict";

import {
  createAiRequestMiddlewareRegistry,
  parseAiRequestMiddlewareSelection,
  parseAiRequestPrompt,
} from "../server/ai-request-middleware-capability";

test("request middleware registry resolves a selected middleware by id", async () => {
  const registry = createAiRequestMiddlewareRegistry();
  let unselectedMiddlewareRan = false;

  registry.registerRoutingMiddleware({
    id: "first",
    order: 10,
    route: async () => {
      unselectedMiddlewareRan = true;
      return {
        metadata: {
          source: "first",
        },
      };
    },
  });
  registry.registerRoutingMiddleware({
    id: "second",
    order: 20,
    route: async () => ({
      model: "routed-model",
      stop: true,
    }),
  });
  registry.registerRoutingMiddleware({
    id: "third",
    order: 30,
    route: async () => {
      unselectedMiddlewareRan = true;
      return {
        model: "should-not-run",
      };
    },
  });

  const result = await registry.resolveRoutingMiddleware("second", {
    route: {
      id: "request-1",
      receivedAt: Date.now(),
      method: "POST",
      path: "/v1/chat/completions",
      requestedModel: "middleware:second",
      model: "middleware:second",
      stream: false,
    },
    requestedModel: "middleware:second",
    prompt: null,
    knownModels: [],
  });

  assert.equal(result.model, "routed-model");
  assert.equal(result.metadata, undefined);
  assert.deepEqual(result.decisions.map((decision) => decision.id), ["second"]);
  assert.equal(unselectedMiddlewareRan, false);
});

test("parseAiRequestPrompt extracts chat text and tool names", () => {
  const prompt = parseAiRequestPrompt({
    model: "auto",
    messages: [
      {
        role: "system",
        content: "Route carefully.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Compare fast and smart models.",
          },
        ],
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "lookup_catalog",
        },
      },
    ],
  });

  assert.equal(prompt?.kind, "chat");
  assert.equal(prompt?.systemText, "Route carefully.");
  assert.equal(prompt?.userText, "Compare fast and smart models.");
  assert.equal(prompt?.lastUserText, "Compare fast and smart models.");
  assert.deepEqual(prompt?.toolNames, ["lookup_catalog"]);
});

test("parseAiRequestMiddlewareSelection recognizes explicit middleware model selectors", () => {
  assert.equal(parseAiRequestMiddlewareSelection("middleware:router-one"), "router-one");
  assert.equal(parseAiRequestMiddlewareSelection("gpt-5"), undefined);
  assert.equal(parseAiRequestMiddlewareSelection(undefined), undefined);
  assert.equal(parseAiRequestMiddlewareSelection("middleware:   "), "");
});
