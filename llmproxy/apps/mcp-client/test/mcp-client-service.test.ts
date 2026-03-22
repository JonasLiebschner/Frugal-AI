import assert from "node:assert/strict";
import test from "node:test";

import { createMcpClientService } from "../server/mcp-client-capability";
import type { ExternalMcpServerDefinition } from "../server/mcp-client-types";

test("mcp-client initializes remote MCP servers and aggregates their manifest surface", async () => {
  const requests: Array<{ method: string; sessionId: string | null }> = [];
  const service = createMcpClientService({
    fetch: async (_input, init) => {
      if (init?.method === "GET") {
        return new Response(null, { status: 405 });
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const method = typeof body.method === "string" ? body.method : "";
      const sessionId = toHeaderRecord(init?.headers)["mcp-session-id"] ?? null;
      requests.push({ method, sessionId });

      if (method === "initialize") {
        return jsonResponse(
          {
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2025-11-25",
              capabilities: {
                tools: {},
                prompts: {},
                resources: {},
              },
              serverInfo: {
                name: "remote-mcp",
                version: "1.2.3",
              },
              instructions: "Remote server instructions.",
            },
          },
          {
            "mcp-session-id": "remote-session",
            "mcp-protocol-version": "2025-11-25",
          },
        );
      }

      if (method === "notifications/initialized") {
        return new Response(null, {
          status: 202,
          headers: {
            "mcp-session-id": "remote-session",
            "mcp-protocol-version": "2025-11-25",
          },
        });
      }

      if (method === "tools/list") {
        assert.equal(sessionId, "remote-session");
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              {
                name: "remote_tool",
                description: "Remote tool",
                inputSchema: {
                  type: "object",
                },
              },
            ],
          },
        });
      }

      if (method === "prompts/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            prompts: [
              {
                name: "remote_prompt",
                description: "Remote prompt",
              },
            ],
          },
        });
      }

      if (method === "resources/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            resources: [
              {
                name: "manifest",
                uri: "mcp://manifest",
                mimeType: "application/json",
              },
            ],
          },
        });
      }

      if (method === "resources/templates/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            resourceTemplates: [],
          },
        });
      }

      throw new Error(`Unexpected MCP client method: ${method}`);
    },
  });

  service.registerServer(() => createRemoteServerDefinition());

  const manifest = await service.getManifest("remote");

  assert.equal(manifest.server.id, "remote");
  assert.equal(manifest.protocolVersion, "2025-11-25");
  assert.equal(manifest.serverInfo?.name, "remote-mcp");
  assert.equal(manifest.tools[0]?.name, "remote_tool");
  assert.equal(manifest.prompts[0]?.name, "remote_prompt");
  assert.equal(manifest.resources[0]?.uri, "mcp://manifest");
  assert.deepEqual(
    requests.map((request) => request.method),
    [
      "initialize",
      "notifications/initialized",
      "tools/list",
      "prompts/list",
      "resources/list",
      "resources/templates/list",
    ],
  );
});

test("mcp-client forwards tool calls and prompt requests to initialized remote servers", async () => {
  const methods: string[] = [];
  const service = createMcpClientService({
    fetch: async (_input, init) => {
      if (init?.method === "GET") {
        return new Response(null, { status: 405 });
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const method = String(body.method ?? "");
      methods.push(method);

      if (method === "initialize") {
        return jsonResponse(
          {
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2025-11-25",
              capabilities: {
                tools: {},
                prompts: {},
              },
              serverInfo: {
                name: "remote-mcp",
                version: "1.2.3",
              },
            },
          },
          {
            "mcp-session-id": "remote-session",
            "mcp-protocol-version": "2025-11-25",
          },
        );
      }

      if (method === "notifications/initialized") {
        return new Response(null, {
          status: 202,
          headers: {
            "mcp-session-id": "remote-session",
            "mcp-protocol-version": "2025-11-25",
          },
        });
      }

      if (method === "tools/call") {
        assert.deepEqual(body.params, {
          name: "remote_tool",
          arguments: {
            input: "hello",
          },
        });
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [
              {
                type: "text",
                text: "tool ok",
              },
            ],
          },
        });
      }

      if (method === "prompts/get") {
        assert.deepEqual(body.params, {
          name: "remote_prompt",
          arguments: {
            topic: "status",
          },
        });
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: "prompt ok",
                },
              },
            ],
          },
        });
      }

      if (method === "completion/complete") {
        assert.deepEqual(body.params, {
          ref: {
            type: "ref/prompt",
            name: "remote_prompt",
          },
          argument: {
            name: "topic",
            value: "sta",
          },
          context: {
            arguments: {
              environment: "prod",
            },
          },
        });
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            completion: {
              values: ["status"],
            },
          },
        });
      }

      throw new Error(`Unexpected MCP client method: ${method}`);
    },
  });

  service.registerServer(() => createRemoteServerDefinition());

  const toolResult = await service.callTool("remote", "remote_tool", { input: "hello" });
  const promptResult = await service.getPrompt("remote", "remote_prompt", { topic: "status" });
  const completionResult = await service.completePrompt("remote", "remote_prompt", {
    argumentName: "topic",
    value: "sta",
    contextArguments: {
      environment: "prod",
    },
  });

  assert.equal(toolResult.content[0]?.type, "text");
  assert.equal(promptResult.messages[0]?.role, "user");
  assert.deepEqual(completionResult.completion.values, ["status"]);
  assert.deepEqual(
    methods,
    [
      "initialize",
      "notifications/initialized",
      "tools/call",
      "prompts/get",
      "completion/complete",
    ],
  );
});

function createRemoteServerDefinition(): ExternalMcpServerDefinition {
  return {
    id: "remote",
    title: "Remote MCP",
    endpoint: "https://remote.example/mcp",
  };
}

function jsonResponse(
  payload: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function toHeaderRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)]),
  );
}
