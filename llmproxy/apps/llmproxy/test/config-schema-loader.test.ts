import assert from "node:assert/strict";
import test from "node:test";

import type { ConfigSchemaDocument } from "../app/types/dashboard";
import {
  createConfigSchemaLoadCoordinator,
  fetchConfigSchemas,
} from "../llmproxy-client";

test("fetchConfigSchemas returns requested schema documents", async () => {
  const response = await fetchConfigSchemas(["ai-client", "mcp-client"], async (input) => {
    assert.equal(input, "/api/config/schema?packages=ai-client+mcp-client");

    return new Response(JSON.stringify({
      properties: {
        "ai-client": {
          type: "object",
          properties: {
            connections: { type: "array" },
          },
        },
        "mcp-client": {
          type: "object",
          properties: {
            servers: { type: "array" },
          },
        },
      },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  });

  assert.deepEqual(response, {
    "ai-client": {
      type: "object",
      properties: {
        connections: { type: "array" },
      },
    },
    "mcp-client": {
      type: "object",
      properties: {
        servers: { type: "array" },
      },
    },
  });
});

test("fetchConfigSchemas ignores invalid schema payloads", async () => {
  const response = await fetchConfigSchemas(["ai-client", "mcp-client"], async () => (
    new Response(JSON.stringify({
      properties: {
        "ai-client": ["not-a-schema"],
        "mcp-client": null,
      },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    })
  ));

  assert.deepEqual(response, {});
});

test("fetchConfigSchemas returns an empty result for unsuccessful responses", async () => {
  const response = await fetchConfigSchemas(["ai-client"], async () => (
    new Response("unavailable", { status: 503 })
  ));

  assert.deepEqual(response, {});
});

test("fetchConfigSchemas returns an empty result when the schema request times out", async () => {
  const response = await fetchConfigSchemas(["ai-client"], async (_input, init) => {
    const signal = init?.signal;

    return await new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () => {
        reject(signal.reason ?? new Error("aborted"));
      }, { once: true });
    });
  }, 20);

  assert.deepEqual(response, {});
});

test("config schema load coordinator deduplicates concurrent schema requests", async () => {
  const loadedSchemas: Partial<Record<string, ConfigSchemaDocument>> = {};
  let fetchCalls = 0;

  const loadConfigSchemas = createConfigSchemaLoadCoordinator(
    (packageName) => loadedSchemas[packageName],
    (schemas) => {
      Object.assign(loadedSchemas, schemas);
    },
    async () => {
      fetchCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));

      return new Response(JSON.stringify({
        properties: {
          "ai-client": {
            type: "object",
          },
        },
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    },
  );

  await Promise.all([
    loadConfigSchemas(["ai-client"]),
    loadConfigSchemas(["ai-client"]),
  ]);

  assert.equal(fetchCalls, 1);
  assert.deepEqual(loadedSchemas["ai-client"], { type: "object" });
});

test("config schema load coordinator retries packages that did not load", async () => {
  const loadedSchemas: Partial<Record<string, ConfigSchemaDocument>> = {};
  let fetchCalls = 0;

  const loadConfigSchemas = createConfigSchemaLoadCoordinator(
    (packageName) => loadedSchemas[packageName],
    (schemas) => {
      Object.assign(loadedSchemas, schemas);
    },
    async () => {
      fetchCalls += 1;

      if (fetchCalls === 1) {
        return new Response("unavailable", { status: 503 });
      }

      return new Response(JSON.stringify({
        properties: {
          "ai-client": {
            type: "object",
          },
        },
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    },
  );

  await loadConfigSchemas(["ai-client"]);
  await loadConfigSchemas(["ai-client"]);

  assert.equal(fetchCalls, 2);
  assert.deepEqual(loadedSchemas["ai-client"], { type: "object" });
});
