import assert from "node:assert/strict";
import test from "node:test";
import { fetchNodeRequestHandler } from "node-mock-http";

import { createNitroTestHost } from "../../shared/test/nitro-test-host";
import { createConfigTestRuntime } from "./runtime-api";

test("config schema route exposes all registered app schemas by default", async () => {
  const runtime = createConfigTestRuntime({
    schemas: {
      "ai-client": {
        type: "object",
        properties: {
          server: {
            type: "object",
          },
        },
      },
      "mcp-client": {
        type: "object",
        properties: {
          servers: {
            type: "array",
          },
        },
      },
    },
  });

  const host = createNitroTestHost({
    testLayers: [runtime],
  });
  type LocalNodeRequestHandler = Parameters<typeof fetchNodeRequestHandler>[0];

  const response = await fetchNodeRequestHandler(
    host as unknown as LocalNodeRequestHandler,
    "/api/config/schema",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    type: "object",
    properties: {
      "ai-client": {
        type: "object",
        properties: {
          server: {
            type: "object",
          },
        },
      },
      "mcp-client": {
        type: "object",
        properties: {
          servers: {
            type: "array",
          },
        },
      },
    },
  });
});

test("config routes reject payloads that violate a registered app schema", async () => {
  const runtime = createConfigTestRuntime({
    schemas: {
      "test-app": {
        type: "object",
        properties: {
          enabled: {
            type: "boolean",
          },
        },
        required: ["enabled"],
        additionalProperties: false,
      },
    },
  });

  const host = createNitroTestHost({
    testLayers: [runtime],
  });
  type LocalNodeRequestHandler = Parameters<typeof fetchNodeRequestHandler>[0];

  const response = await fetchNodeRequestHandler(
    host as unknown as LocalNodeRequestHandler,
    "/api/config/test-app",
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: {
          enabled: "yes",
        },
      }),
    },
  );

  assert.equal(response.status, 400);
  const body = await response.json() as {
    error?: { type?: string };
    validationErrors?: unknown[];
  };
  assert.equal(body.error?.type, "config_validation_error");
  assert.equal(Array.isArray(body.validationErrors), true);
});

test("config routes reject readOnly fields in public writes", async () => {
  const runtime = createConfigTestRuntime({
    schemas: {
      "test-app": {
        type: "object",
        properties: {
          editable: {
            type: "string",
          },
          generatedId: {
            type: "string",
            readOnly: true,
          },
          nested: {
            type: "object",
            properties: {
              editable: {
                type: "string",
              },
              generatedAt: {
                type: "string",
                readOnly: true,
              },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
  });

  const host = createNitroTestHost({
    testLayers: [runtime],
  });
  type LocalNodeRequestHandler = Parameters<typeof fetchNodeRequestHandler>[0];

  const response = await fetchNodeRequestHandler(
    host as unknown as LocalNodeRequestHandler,
    "/api/config/test-app",
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: {
          editable: "ok",
          generatedId: "server-owned",
          nested: {
            editable: "still-ok",
            generatedAt: "2026-03-19T00:00:00.000Z",
          },
        },
      }),
    },
  );

  assert.equal(response.status, 400);
  const body = await response.json() as {
    error?: { type?: string };
    accessViolations?: unknown[];
  };
  assert.equal(body.error?.type, "config_read_only_error");
  assert.deepEqual(body.accessViolations, [
    {
      instancePath: "/generatedId",
      keyword: "readOnly",
      message: "Field is marked as readOnly.",
    },
    {
      instancePath: "/nested/generatedAt",
      keyword: "readOnly",
      message: "Field is marked as readOnly.",
    },
  ]);
});

test("config routes redact writeOnly fields from public reads while keeping stored values", async () => {
  const runtime = createConfigTestRuntime({
    schemas: {
      "test-app": {
        type: "object",
        properties: {
          visible: {
            type: "string",
          },
          apiKey: {
            type: "string",
            writeOnly: true,
          },
          nested: {
            type: "object",
            properties: {
              visible: {
                type: "string",
              },
              password: {
                type: "string",
                writeOnly: true,
              },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
  });

  const host = createNitroTestHost({
    testLayers: [runtime],
  });
  type LocalNodeRequestHandler = Parameters<typeof fetchNodeRequestHandler>[0];

  runtime.config.writeConfigFile("test-app", {
    visible: "hello",
    apiKey: "secret-token",
    nested: {
      visible: "world",
      password: "super-secret",
    },
  });
  assert.deepEqual(runtime.config.readConfig("test-app"), {
    visible: "hello",
    apiKey: "secret-token",
    nested: {
      visible: "world",
      password: "super-secret",
    },
  });

  const idResponse = await fetchNodeRequestHandler(
    host as unknown as LocalNodeRequestHandler,
    "/api/config/test-app",
  );
  assert.equal(idResponse.status, 200);
  assert.deepEqual(await idResponse.json(), {
    visible: "hello",
    nested: {
      visible: "world",
    },
  });

  const indexResponse = await fetchNodeRequestHandler(
    host as unknown as LocalNodeRequestHandler,
    "/api/config?packages=test-app",
  );
  assert.equal(indexResponse.status, 200);
  assert.deepEqual(await indexResponse.json(), {
    "test-app": {
      visible: "hello",
      nested: {
        visible: "world",
      },
    },
  });
});
