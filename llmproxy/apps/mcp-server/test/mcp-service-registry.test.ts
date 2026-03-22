import assert from "node:assert/strict";
import test from "node:test";

import { createMcpTestRegistry } from "./runtime-api";

function createNotFoundFetch() {
  return async <T>(_path: string): Promise<T> => {
    throw {
      statusCode: 404,
    };
  };
}

test("MCP adapter exposes registered handlers over the MCP protocol", async () => {
  const registry = createMcpTestRegistry({
    requestFetch: createNotFoundFetch(),
  });

  registry.registerHandler(() => ({
    definition: {
      id: "test-service",
      title: "Test service",
      description: "Synthetic MCP service for registry tests.",
      helperRoutes: [],
      tools: [
        {
          name: "echo_tool",
          title: "Echo tool",
          description: "Returns the provided input.",
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
            },
            required: ["value"],
            additionalProperties: false,
          },
        },
      ],
      prompts: [
        {
          name: "echo_prompt",
          title: "Echo prompt",
          description: "Returns one prompt message.",
          arguments: [
            {
              name: "value",
              description: "Prompt value.",
              required: true,
            },
          ],
        },
      ],
    },
    callTool: async (_toolName, args) => {
      const toolArgs = args as { value?: string };
      return ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            value: toolArgs.value,
          }),
        },
      ],
      structuredContent: {
        value: toolArgs.value,
      },
    });
    },
    getPrompt: async (_promptName, args) => ({
      description: "Returns one prompt message.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: String(args.value),
          },
        },
      ],
    }),
  }));

  const manifest = await registry.getManifest();
  assert.equal(manifest.services.length, 1);
  assert.equal(manifest.services[0]?.id, "test-service");
  assert.deepEqual(manifest.services[0]?.tools.map((tool) => tool.name), ["echo_tool"]);
  assert.equal(manifest.services[0]?.tools[0]?.outputSchema?.type, "object");
  assert.deepEqual(manifest.services[0]?.prompts.map((prompt) => prompt.name), ["echo_prompt"]);

  const toolResult = await registry.handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "echo_tool",
      arguments: {
        value: "hello",
      },
    },
  }) as {
    result?: {
      structuredContent?: {
        value?: string;
      };
    };
  };
  assert.equal(toolResult.result?.structuredContent?.value, "hello");

  const promptResult = await registry.handleRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "prompts/get",
    params: {
      name: "echo_prompt",
      arguments: {
        value: "hello",
      },
    },
  }) as {
    result?: {
      messages?: Array<{
        content?: {
          text?: string;
        };
      }>;
    };
  };
  assert.equal(promptResult.result?.messages?.[0]?.content?.text, "hello");
});

test("MCP adapter base64-encodes byte outputs for tools without an outputSchema", async () => {
  const registry = createMcpTestRegistry({
    requestFetch: createNotFoundFetch(),
  });

  registry.registerHandler(() => ({
    definition: {
      id: "test-service",
      title: "Test service",
      description: "Synthetic MCP service for registry tests.",
      helperRoutes: [],
      tools: [
        {
          name: "binary_tool",
          title: "Binary tool",
          description: "Returns bytes instead of structured JSON.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      ],
      prompts: [],
    },
    callTool: async () => ({
      content: [
        {
          type: "text",
          text: "Returned a binary payload.",
        },
      ],
      bytes: "AQID",
      mimeType: "application/octet-stream",
    }),
  }));

  const toolResult = await registry.handleRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "binary_tool",
      arguments: {},
    },
  }) as {
    result?: {
      bytes?: string;
      mimeType?: string;
      structuredContent?: unknown;
    };
  };

  assert.equal(toolResult.result?.bytes, "AQID");
  assert.equal(toolResult.result?.mimeType, "application/octet-stream");
  assert.equal(toolResult.result?.structuredContent, undefined);
});

test("MCP adapter exposes prompt completion and derived resources", async () => {
  const registry = createMcpTestRegistry({
    requestFetch: createNotFoundFetch(),
  });

  registry.registerHandler(() => ({
    definition: {
      id: "test-service",
      title: "Test service",
      description: "Synthetic MCP service for registry tests.",
      helperRoutes: [],
      tools: [],
      prompts: [
        {
          name: "echo_prompt",
          title: "Echo prompt",
          description: "Returns one prompt message.",
          arguments: [
            {
              name: "value",
              description: "Prompt value.",
              required: true,
            },
          ],
        },
      ],
    },
    getPrompt: async (_promptName, args) => ({
      description: "Returns one prompt message.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: String(args.value),
          },
        },
      ],
    }),
    completePrompt: async (_promptName, request) => ({
      completion: {
        values: request.value.length > 0
          ? [`${request.value}-1`, `${request.value}-2`]
          : ["alpha", "beta"],
        total: 2,
        hasMore: false,
      },
    }),
  }));

  const completionResult = await registry.handleRequest({
    jsonrpc: "2.0",
    id: 4,
    method: "completion/complete",
    params: {
      ref: {
        type: "ref/prompt",
        name: "echo_prompt",
      },
      argument: {
        name: "value",
        value: "diag",
      },
      context: {
        arguments: {
          value: "diag",
        },
      },
    },
  }) as {
    result?: {
      completion?: {
        values?: string[];
        total?: number;
        hasMore?: boolean;
      };
    };
  };

  assert.deepEqual(completionResult.result?.completion?.values, ["diag-1", "diag-2"]);
  assert.equal(completionResult.result?.completion?.total, 2);
  assert.equal(completionResult.result?.completion?.hasMore, false);

  const resourcesResult = await registry.handleRequest({
    jsonrpc: "2.0",
    id: 5,
    method: "resources/list",
    params: {},
  }) as {
    result?: {
      resources?: Array<{
        uri?: string;
      }>;
    };
  };

  assert.ok(
    resourcesResult.result?.resources?.some((resource) => resource.uri === "mcp://manifest"),
  );
  assert.ok(
    resourcesResult.result?.resources?.some((resource) => resource.uri === "mcp://services/test-service/prompts/echo_prompt"),
  );

  const resourceReadResult = await registry.handleRequest({
    jsonrpc: "2.0",
    id: 6,
    method: "resources/read",
    params: {
      uri: "mcp://services/test-service/prompts/echo_prompt",
    },
  }) as {
    result?: {
      contents?: Array<{
        uri?: string;
        mimeType?: string;
        text?: string;
      }>;
    };
  };

  assert.equal(resourceReadResult.result?.contents?.[0]?.uri, "mcp://services/test-service/prompts/echo_prompt");
  assert.equal(resourceReadResult.result?.contents?.[0]?.mimeType, "application/json");
  assert.match(resourceReadResult.result?.contents?.[0]?.text ?? "", /echo_prompt/);
});
