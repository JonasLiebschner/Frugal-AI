import assert from "node:assert/strict";
import test from "node:test";

import { createDiagnosticsMcpClient } from "../llmproxy-client";

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

test("diagnostics MCP client initializes a session before calling tools", async () => {
  const requests: Array<{ method: string; headers: Record<string, string> }> = [];
  const client = createDiagnosticsMcpClient(async (_input, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    const method = String(payload.method ?? "");
    const headers = toHeaderRecord(init?.headers);
    requests.push({ method, headers });

    if (method === "initialize") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2025-11-25",
        },
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "mcp-session-id": "session-1",
          "mcp-protocol-version": "2025-11-25",
        },
      });
    }

    if (method === "notifications/initialized") {
      return new Response(null, {
        status: 202,
      });
    }

    assert.equal(method, "tools/call");
    assert.equal(headers["mcp-session-id"], "session-1");
    assert.equal(headers["mcp-protocol-version"], "2025-11-25");

    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      result: {
        ok: true,
      },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  });

  const payload = await client.call("tools/call", {
    name: "list_models",
    arguments: {},
  });

  assert.deepEqual(payload, { ok: true });
  assert.deepEqual(requests.map((request) => request.method), [
    "initialize",
    "notifications/initialized",
    "tools/call",
  ]);
});

test("diagnostics MCP client reinitializes and retries when the MCP session is lost", async () => {
  const toolCallSessionIds: string[] = [];
  let initializeCount = 0;
  let toolCallCount = 0;
  const client = createDiagnosticsMcpClient(async (_input, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    const method = String(payload.method ?? "");
    const headers = toHeaderRecord(init?.headers);

    if (method === "initialize") {
      initializeCount += 1;
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: initializeCount,
        result: {
          protocolVersion: "2025-11-25",
        },
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "mcp-session-id": `session-${initializeCount}`,
          "mcp-protocol-version": "2025-11-25",
        },
      });
    }

    if (method === "notifications/initialized") {
      return new Response(null, {
        status: 202,
      });
    }

    assert.equal(method, "tools/call");
    toolCallCount += 1;
    toolCallSessionIds.push(headers["mcp-session-id"] ?? "");

    if (toolCallCount === 1) {
      return new Response(JSON.stringify({
        error: {
          message: "MCP session was not found.",
        },
      }), {
        status: 404,
        headers: {
          "content-type": "application/json",
        },
      });
    }

    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: toolCallCount,
      result: {
        recovered: true,
      },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  });

  const payload = await client.call("tools/call", {
    name: "list_models",
    arguments: {},
  });

  assert.deepEqual(payload, { recovered: true });
  assert.equal(initializeCount, 2);
  assert.deepEqual(toolCallSessionIds, ["session-1", "session-2"]);
});
