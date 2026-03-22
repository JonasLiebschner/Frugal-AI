import assert from "node:assert/strict";
import test from "node:test";
import { fetchNodeRequestHandler } from "node-mock-http";

import { createNitroTestHost } from "../../shared/test/nitro-test-host";
import {
  buildMcpClientInternalManifestPath,
  mcpClientInternalServersPath,
} from "../server/mcp-client-capability";
import { createMcpClientTestRuntime } from "./runtime-api";

test("mcp-client internal routes expose registered remote server manifests", async () => {
  const runtime = createMcpClientTestRuntime({
    fetch: async (_input, init) => {
      if (init?.method === "GET") {
        return new Response(null, { status: 405 });
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const method = String(body.method ?? "");

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
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              {
                name: "remote_tool",
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
            prompts: [],
          },
        });
      }

      if (method === "resources/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            resources: [],
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

  runtime.mcpClient.registerServer(() => ({
    id: "remote",
    title: "Remote MCP",
    endpoint: "https://remote.example/mcp",
  }));

  const host = createNitroTestHost({
    testLayers: [runtime],
  });
  type LocalNodeRequestHandler = Parameters<typeof fetchNodeRequestHandler>[0];

  const serversResponse = await fetchNodeRequestHandler(
    host as unknown as LocalNodeRequestHandler,
    mcpClientInternalServersPath,
  );
  assert.equal(serversResponse.status, 200);
  assert.deepEqual(await serversResponse.json(), [
    {
      id: "remote",
      title: "Remote MCP",
      endpoint: "https://remote.example/mcp",
    },
  ]);

  const manifestResponse = await fetchNodeRequestHandler(
    host as unknown as LocalNodeRequestHandler,
    buildMcpClientInternalManifestPath("remote"),
  );
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.server.id, "remote");
  assert.equal(manifest.tools[0]?.name, "remote_tool");
});

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
