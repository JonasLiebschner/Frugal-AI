import assert from "node:assert/strict";
import test from "node:test";

import {
  createMcpHttpTransport,
} from "../server/mcp-server-capability";

test("MCP HTTP transport initializes sessions and enforces negotiated protocol versions", () => {
  const transport = createMcpHttpTransport({
    supportedVersions: ["2025-11-25", "2025-03-26"],
  });

  const initialize = transport.initialize({
    protocolVersion: "2025-11-25",
    clientInfo: {
      name: "test-client",
      version: "1.0.0",
    },
    capabilities: {},
  });

  assert.ok("session" in initialize);
  if (!("session" in initialize)) {
    return;
  }

  assert.equal(initialize.result.protocolVersion, "2025-11-25");
  assert.equal(initialize.session.protocolVersion, "2025-11-25");
  assert.equal(transport.getSession(initialize.session.id)?.id, initialize.session.id);

  const resolvedProtocol = transport.resolveProtocolVersion(initialize.session, "2025-11-25");
  assert.deepEqual(resolvedProtocol, {
    protocolVersion: "2025-11-25",
  });

  assert.equal(transport.markInitialized(initialize.session.id), true);
  assert.equal(transport.getSession(initialize.session.id)?.initialized, true);
  assert.equal(transport.terminateSession(initialize.session.id), true);
  assert.equal(transport.getSession(initialize.session.id), undefined);
});

test("MCP HTTP transport rejects unsupported protocol versions and disallowed origins", () => {
  const transport = createMcpHttpTransport({
    supportedVersions: ["2025-11-25"],
    allowedOrigins: () => ["https://example.com"],
  });

  const unsupported = transport.initialize({
    protocolVersion: "2024-01-01",
  });
  assert.ok("response" in unsupported);
  if ("response" in unsupported) {
    assert.ok("error" in unsupported.response);
    if ("error" in unsupported.response) {
      assert.equal(unsupported.response.error.code, -32602);
    }
  }

  assert.equal(transport.supportsOrigin({
    originHeader: "https://example.com",
  }), true);
  assert.equal(transport.supportsOrigin({
    originHeader: "http://127.0.0.1:3000",
  }), true);
  assert.equal(transport.supportsOrigin({
    originHeader: "https://not-allowed.example",
  }), false);
});

test("MCP HTTP transport accepts same-origin requests behind forwarded reverse proxies", () => {
  const transport = createMcpHttpTransport({
    supportedVersions: ["2025-11-25"],
  });

  assert.equal(transport.supportsOrigin({
    originHeader: "https://llmproxy.example.com",
    requestOrigin: "https://llmproxy.example.com",
  }), true);

  assert.equal(transport.supportsOrigin({
    originHeader: "https://llmproxy.example.com",
    requestOrigin: "http://127.0.0.1:3000",
  }), false);
});
