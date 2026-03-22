import assert from "node:assert/strict";
import test from "node:test";

import {
  getJsonSchemaNotes,
  getJsonSchemaObjectShape,
  getJsonSchemaTypeLabel,
} from "../json-schema-display";

test("json-schema display helpers describe direct schema constraints", () => {
  const schema = {
    type: "object",
    properties: {
      count: {
        type: "integer",
        minimum: 1,
        maximum: 10,
      },
      status: {
        enum: ["queued", "running", "done", "failed", "cancelled"],
      },
    },
  };

  assert.equal(getJsonSchemaTypeLabel(schema, schema.properties.count), "integer");
  assert.deepEqual(getJsonSchemaNotes(schema, schema.properties.count), ["min 1", "max 10"]);
  assert.equal(getJsonSchemaTypeLabel(schema, schema.properties.status), "enum");
  assert.deepEqual(getJsonSchemaNotes(schema, schema.properties.status), ["one of queued, running, done, failed, ..."]);
});

test("json-schema display helpers resolve local refs before describing schemas", () => {
  const schema = {
    $defs: {
      backend: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          models: {
            type: "array",
            items: {
              type: "string",
            },
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
        },
      },
    },
  };

  assert.equal(getJsonSchemaTypeLabel(schema, schema.properties.backends.items), "object");
  assert.deepEqual(getJsonSchemaNotes(schema, schema.properties.backends.items), ["2 fields"]);
  assert.deepEqual(
    getJsonSchemaNotes(schema, {
      type: "array",
      items: {
        $ref: "#/$defs/backend/properties/id",
      },
    }),
    ["items string"],
  );
});

test("json-schema object shape resolves local refs for object property listings", () => {
  const schema = {
    $defs: {
      promptArgs: {
        type: "object",
        required: ["topic"],
        properties: {
          topic: { type: "string" },
          tone: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    type: "object",
    properties: {
      arguments: {
        $ref: "#/$defs/promptArgs",
      },
    },
  };

  const shape = getJsonSchemaObjectShape(schema, schema.properties.arguments);

  assert.deepEqual(shape?.properties.map(([name]) => name), ["topic", "tone"]);
  assert.deepEqual(Array.from(shape?.requiredNames ?? []), ["topic"]);
  assert.equal(shape?.allowsAdditionalProperties, false);
});
