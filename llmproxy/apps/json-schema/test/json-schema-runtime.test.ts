import assert from "node:assert/strict";
import test from "node:test";

import {
  listJsonSchemaAccessViolations,
  omitReadOnlyJsonSchemaFields,
  projectJsonSchemaValue,
  redactWriteOnlyJsonSchemaFields,
} from "../server/json-schema-capability";

test("json-schema read projection redacts writeOnly fields recursively", () => {
  const schema = {
    type: "object",
    properties: {
      visible: { type: "string" },
      secret: { type: "string", writeOnly: true },
      nested: {
        type: "object",
        properties: {
          visible: { type: "string" },
          password: { type: "string", writeOnly: true },
        },
      },
      tokens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            value: { type: "string", writeOnly: true },
            label: { type: "string" },
          },
        },
      },
    },
  };

  const value = {
    visible: "hello",
    secret: "top-secret",
    nested: {
      visible: "world",
      password: "super-secret",
    },
    tokens: [
      { value: "abc", label: "first" },
      { value: "def", label: "second" },
    ],
  };

  assert.deepEqual(redactWriteOnlyJsonSchemaFields(schema, value), {
    visible: "hello",
    nested: {
      visible: "world",
    },
    tokens: [
      { label: "first" },
      { label: "second" },
    ],
  });
});

test("json-schema write projection omits readOnly fields recursively", () => {
  const schema = {
    type: "object",
    properties: {
      status: { type: "string", readOnly: true },
      nested: {
        type: "object",
        properties: {
          generatedAt: { type: "string", readOnly: true },
          editable: { type: "string" },
        },
      },
    },
  };

  const value = {
    status: "ok",
    nested: {
      generatedAt: "today",
      editable: "allowed",
    },
  };

  assert.deepEqual(omitReadOnlyJsonSchemaFields(schema, value), {
    nested: {
      editable: "allowed",
    },
  });
  assert.deepEqual(projectJsonSchemaValue(schema, value, "write"), {
    nested: {
      editable: "allowed",
    },
  });
});

test("json-schema write access violations point to readOnly payload fields", () => {
  const schema = {
    type: "object",
    properties: {
      status: { type: "string", readOnly: true },
      nested: {
        type: "object",
        properties: {
          generatedAt: { type: "string", readOnly: true },
          editable: { type: "string" },
        },
      },
      tags: {
        type: "array",
        prefixItems: [
          { type: "string", readOnly: true },
        ],
        items: { type: "string" },
      },
    },
  };

  assert.deepEqual(listJsonSchemaAccessViolations(schema, {
    status: "ok",
    nested: {
      generatedAt: "today",
      editable: "allowed",
    },
    tags: ["blocked", "allowed"],
  }, "write"), [
    {
      instancePath: "/status",
      keyword: "readOnly",
      message: "Field is marked as readOnly.",
    },
    {
      instancePath: "/nested/generatedAt",
      keyword: "readOnly",
      message: "Field is marked as readOnly.",
    },
    {
      instancePath: "/tags/0",
      keyword: "readOnly",
      message: "Field is marked as readOnly.",
    },
  ]);
});

test("json-schema projection and access checks resolve local $ref schemas", () => {
  const schema = {
    $defs: {
      credentials: {
        type: "object",
        properties: {
          apiKey: { type: "string", writeOnly: true },
          generatedAt: { type: "string", readOnly: true },
          label: { type: "string" },
        },
      },
    },
    type: "object",
    properties: {
      backend: {
        $ref: "#/$defs/credentials",
      },
    },
  };

  assert.deepEqual(
    redactWriteOnlyJsonSchemaFields(schema, {
      backend: {
        apiKey: "secret",
        generatedAt: "today",
        label: "visible",
      },
    }),
    {
      backend: {
        generatedAt: "today",
        label: "visible",
      },
    },
  );

  assert.deepEqual(
    listJsonSchemaAccessViolations(schema, {
      backend: {
        generatedAt: "today",
      },
    }, "write"),
    [{
      instancePath: "/backend/generatedAt",
      keyword: "readOnly",
      message: "Field is marked as readOnly.",
    }],
  );
});
