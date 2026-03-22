import assert from "node:assert/strict";
import test from "node:test";

import {
  getJsonSchemaFieldBooleanDefault,
  getJsonSchemaFieldExampleText,
  getJsonSchemaFieldJsonExampleText,
  getJsonSchemaFieldLabel,
  getJsonSchemaFieldLineListExampleText,
  getJsonSchemaFieldMeta,
  getJsonSchemaFieldMetaMap,
  getJsonSchemaFieldNumberDefault,
  getJsonSchemaFieldStringDefault,
} from "../json-schema-field-meta";

test("getJsonSchemaFieldMeta resolves nested object and array field annotations", () => {
  const schema = {
    type: "object",
    properties: {
      server: {
        type: "object",
        required: ["requestTimeoutMs"],
        properties: {
          requestTimeoutMs: {
            type: "integer",
            title: "Request timeout",
            description: "Maximum request runtime.",
            default: 30_000,
            examples: [45_000],
          },
        },
      },
      backends: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "apiKey"],
          properties: {
            id: { type: "string" },
            apiKey: {
              type: "string",
              writeOnly: true,
              description: "Stored secret.",
            },
            status: {
              type: "string",
              readOnly: true,
              deprecated: true,
            },
          },
        },
      },
    },
  };

  assert.deepEqual(
    getJsonSchemaFieldMeta(schema, ["server", "requestTimeoutMs"]),
    {
      path: "server.requestTimeoutMs",
      required: true,
      readOnly: false,
      writeOnly: false,
      deprecated: false,
      title: "Request timeout",
      description: "Maximum request runtime.",
      defaultValue: 30_000,
      examples: [45_000],
    },
  );

  assert.deepEqual(
    getJsonSchemaFieldMeta(schema, ["backends", "*", "apiKey"]),
    {
      path: "backends.*.apiKey",
      required: true,
      readOnly: false,
      writeOnly: true,
      deprecated: false,
      title: undefined,
      description: "Stored secret.",
      defaultValue: undefined,
      examples: undefined,
    },
  );

  assert.deepEqual(
    getJsonSchemaFieldMeta(schema, ["backends", "*", "status"]),
    {
      path: "backends.*.status",
      required: false,
      readOnly: true,
      writeOnly: false,
      deprecated: true,
      title: undefined,
      description: undefined,
      defaultValue: undefined,
      examples: undefined,
    },
  );
});

test("getJsonSchemaFieldMeta returns null when a path is not declared in the schema", () => {
  const schema = {
    type: "object",
    properties: {
      server: {
        type: "object",
        properties: {},
      },
    },
  };

  assert.equal(getJsonSchemaFieldMeta(schema, ["server", "missingField"]), null);
  assert.equal(getJsonSchemaFieldMeta(schema, ["backends", "*", "apiKey"]), null);
});

test("getJsonSchemaFieldMetaMap resolves multiple fields from one schema walk description", () => {
  const schema = {
    type: "object",
    properties: {
      server: {
        type: "object",
        properties: {
          requestTimeoutMs: {
            type: "integer",
            title: "Request timeout",
          },
          queueTimeoutMs: {
            type: "integer",
            readOnly: true,
          },
        },
      },
    },
  };

  const fieldMeta = getJsonSchemaFieldMetaMap(schema, {
    requestTimeoutMs: ["server", "requestTimeoutMs"],
    queueTimeoutMs: ["server", "queueTimeoutMs"],
  });

  assert.equal(fieldMeta.requestTimeoutMs?.title, "Request timeout");
  assert.equal(fieldMeta.queueTimeoutMs?.readOnly, true);
});

test("json-schema field label and example helpers prefer annotation metadata", () => {
  const schema = {
    type: "object",
    properties: {
      backend: {
        type: "object",
        properties: {
          baseUrl: {
            type: "string",
            title: "Base URL",
            examples: ["http://127.0.0.1:8080"],
          },
        },
      },
    },
  };

  const fieldMeta = getJsonSchemaFieldMeta(schema, ["backend", "baseUrl"]);

  assert.equal(getJsonSchemaFieldLabel(fieldMeta, "Fallback"), "Base URL");
  assert.equal(getJsonSchemaFieldExampleText(fieldMeta), "http://127.0.0.1:8080");
  assert.equal(getJsonSchemaFieldLabel(null, "Fallback"), "Fallback");
  assert.equal(getJsonSchemaFieldExampleText(null), undefined);
});

test("json-schema example helpers format JSON and line-list examples", () => {
  const schema = {
    type: "object",
    properties: {
      backend: {
        type: "object",
        properties: {
          headers: {
            type: "object",
            examples: [{ authorization: "Bearer ..." }],
          },
          models: {
            type: "array",
            examples: [["*", "gpt-*"]],
          },
        },
      },
    },
  };

  assert.equal(
    getJsonSchemaFieldJsonExampleText(getJsonSchemaFieldMeta(schema, ["backend", "headers"])),
    '{\n  "authorization": "Bearer ..."\n}',
  );
  assert.equal(
    getJsonSchemaFieldLineListExampleText(getJsonSchemaFieldMeta(schema, ["backend", "models"])),
    "*\ngpt-*",
  );
  assert.equal(getJsonSchemaFieldJsonExampleText(null), undefined);
  assert.equal(getJsonSchemaFieldLineListExampleText(null), undefined);
});

test("json-schema field default helpers coerce supported default types", () => {
  const schema = {
    type: "object",
    properties: {
      backend: {
        type: "object",
        properties: {
          connector: {
            type: "string",
            default: "openai",
          },
          maxConcurrency: {
            type: "integer",
            default: 4,
          },
          enabled: {
            type: "boolean",
            default: false,
          },
        },
      },
    },
  };

  assert.equal(
    getJsonSchemaFieldStringDefault(getJsonSchemaFieldMeta(schema, ["backend", "connector"])),
    "openai",
  );
  assert.equal(
    getJsonSchemaFieldNumberDefault(getJsonSchemaFieldMeta(schema, ["backend", "maxConcurrency"])),
    4,
  );
  assert.equal(
    getJsonSchemaFieldBooleanDefault(getJsonSchemaFieldMeta(schema, ["backend", "enabled"])),
    false,
  );
  assert.equal(getJsonSchemaFieldStringDefault(null), undefined);
  assert.equal(getJsonSchemaFieldNumberDefault(null), undefined);
  assert.equal(getJsonSchemaFieldBooleanDefault(null), undefined);
});

test("getJsonSchemaFieldMeta resolves local $ref targets with sibling annotations", () => {
  const schema = {
    $defs: {
      backend: {
        type: "object",
        required: ["id"],
        properties: {
          id: {
            type: "string",
            title: "Backend id",
          },
          secret: {
            type: "string",
            writeOnly: true,
          },
        },
      },
    },
    type: "object",
    properties: {
      backends: {
        type: "array",
        items: {
          $ref: "#/$defs/backend",
          title: "Configured backend",
        },
      },
    },
  };

  assert.deepEqual(
    getJsonSchemaFieldMeta(schema, ["backends", "*", "id"]),
    {
      path: "backends.*.id",
      required: true,
      readOnly: false,
      writeOnly: false,
      deprecated: false,
      title: "Backend id",
      description: undefined,
      defaultValue: undefined,
      examples: undefined,
    },
  );
  assert.equal(getJsonSchemaFieldMeta(schema, ["backends", "*", "secret"])?.writeOnly, true);
});
