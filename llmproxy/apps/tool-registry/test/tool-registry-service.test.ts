import assert from "node:assert/strict";
import test from "node:test";

import { createAjvTestValidationService } from "../../ajv/test/runtime-api";
import {
  type ToolProvider,
  type ToolRegistryServiceMetadata,
  type ToolRegistration,
} from "../server/tool-registry-capability";
import { createToolRegistryTestRegistry } from "./runtime-api";

const serviceMetadata: ToolRegistryServiceMetadata = {
  id: "test-service",
  title: "Test service",
  description: "Synthetic tool-registry service for registry tests.",
};

test("tool-registry groups registered tools by service metadata", async () => {
  const registry = createToolRegistryTestRegistry<{ traceId: string }>({
    validation: createAjvTestValidationService(),
  });

  const echoToolProvider = () => ({
    service: serviceMetadata,
    definition: {
      name: "echo_tool",
      title: "Echo tool",
      description: "Returns the provided input and trace id.",
      inputSchema: {
        type: "object",
        properties: {
          value: {
            type: "string",
          },
        },
        required: ["value"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          value: {
            type: "string",
          },
          traceId: {
            type: "string",
          },
        },
        required: ["value", "traceId"],
        additionalProperties: false,
      },
    },
    call: async (args, context) => ({
      content: [
        {
          type: "json",
          json: {
            value: args.value,
            traceId: context.traceId,
          },
        },
      ],
      structuredContent: {
        value: args.value,
        traceId: context.traceId,
      },
    }),
  } satisfies ToolRegistration<{ traceId: string }>);

  registry.registerTool(echoToolProvider satisfies ToolProvider<{ traceId: string }>);

  const services = registry.getServices({ traceId: "trace-123" });

  assert.equal(services.length, 1);
  assert.equal(services[0]?.definition.id, "test-service");
  assert.deepEqual(services[0]?.definition.tools.map((tool) => tool.name), ["echo_tool"]);
  assert.equal(services[0]?.definition.tools[0]?.outputSchema?.type, "object");

  const toolResult = await services[0]?.callTool?.("echo_tool", {
    value: "hello",
  });
  assert.deepEqual(toolResult?.structuredContent, {
    value: "hello",
    traceId: "trace-123",
  });
});

test("tool-registry accepts byte outputs when a tool has no outputSchema", async () => {
  const registry = createToolRegistryTestRegistry<{ traceId: string }>({
    validation: createAjvTestValidationService(),
  });

  const binaryToolProvider = () => ({
    service: serviceMetadata,
    definition: {
      name: "binary_tool",
      title: "Binary tool",
      description: "Returns raw bytes when no structured output schema is declared.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    call: async () => ({
      content: [
        {
          type: "text",
          text: "Returned a binary payload.",
        },
      ],
      bytes: Buffer.from([1, 2, 3]),
      mimeType: "application/octet-stream",
    }),
  } satisfies ToolRegistration<{ traceId: string }>);

  registry.registerTool(binaryToolProvider satisfies ToolProvider<{ traceId: string }>);

  const services = registry.getServices({ traceId: "trace-123" });
  const toolResult = await services[0]?.callTool?.("binary_tool", {});

  assert.deepEqual(Array.from(toolResult?.bytes ?? []), [1, 2, 3]);
  assert.equal(toolResult?.mimeType, "application/octet-stream");
  assert.equal(toolResult?.structuredContent, undefined);
});

test("tool-registry validates tool arguments from the declared input schema", async () => {
  const registry = createToolRegistryTestRegistry<{ traceId: string }>({
    validation: createAjvTestValidationService(),
  });

  const echoToolProvider = () => ({
    service: serviceMetadata,
    definition: {
      name: "echo_tool",
      title: "Echo tool",
      description: "Returns the provided input and trace id.",
      inputSchema: {
        type: "object",
        properties: {
          value: {
            type: "string",
          },
        },
        required: ["value"],
        additionalProperties: false,
        examples: [
          {
            value: "hello",
          },
        ],
      },
      outputSchema: {
        type: "object",
        properties: {
          value: {
            type: "string",
          },
          traceId: {
            type: "string",
          },
        },
        required: ["value", "traceId"],
        additionalProperties: false,
      },
    },
    call: async (args, context) => ({
      content: [
        {
          type: "json",
          json: {
            value: args.value,
            traceId: context.traceId,
          },
        },
      ],
      structuredContent: {
        value: args.value,
        traceId: context.traceId,
      },
    }),
  } satisfies ToolRegistration<{ traceId: string }>);

  registry.registerTool(echoToolProvider satisfies ToolProvider<{ traceId: string }>);

  const services = registry.getServices({ traceId: "trace-123" });
  const toolResult = await services[0]?.callTool?.("echo_tool", {
    value: "hello",
    extra_flag: true,
  }) as {
    isError?: boolean;
    structuredContent?: {
      error?: {
        message?: string;
        details?: string[];
        exampleArguments?: unknown;
      };
    };
  };

  assert.equal(toolResult?.isError, true);
  assert.equal(toolResult?.structuredContent?.error?.message, 'The tool "echo_tool" received invalid arguments.');
  assert.ok(
    toolResult?.structuredContent?.error?.details?.some((detail) => detail.includes('unsupported field "extra_flag"')),
  );
  assert.deepEqual(toolResult?.structuredContent?.error?.exampleArguments, {
    value: "hello",
  });
});
