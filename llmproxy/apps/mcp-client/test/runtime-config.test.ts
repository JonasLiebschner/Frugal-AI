import assert from "node:assert/strict";
import test from "node:test";

import { normalizeConfiguredMcpServers } from "../server/mcp-client-capability";

test("mcp-client runtime config normalizes external servers", () => {
  const servers = normalizeConfiguredMcpServers([
    {
      id: " remote-docs ",
      title: " Remote docs ",
      endpoint: " https://example.com/mcp ",
      description: " Documentation server ",
      headers: {
        authorization: " Bearer secret ",
      },
    },
  ]);

  assert.deepEqual(servers, [
    {
      id: "remote-docs",
      title: "Remote docs",
      endpoint: "https://example.com/mcp",
      description: "Documentation server",
      transport: "streamable-http",
      headers: {
        authorization: "Bearer secret",
      },
    },
  ]);
});

test("mcp-client runtime config rejects duplicate server ids", () => {
  assert.throws(
    () => normalizeConfiguredMcpServers([
      {
        id: "remote",
        title: "Remote one",
        endpoint: "https://example.com/one",
      },
      {
        id: "remote",
        title: "Remote two",
        endpoint: "https://example.com/two",
      },
    ]),
    /Duplicate external MCP server id "remote"/,
  );
});

test("mcp-client runtime config rejects invalid headers", () => {
  assert.throws(
    () => normalizeConfiguredMcpServers([
      {
        id: "remote",
        title: "Remote",
        endpoint: "https://example.com",
        headers: {
          authorization: 123,
        },
      },
    ]),
    /must be a non-empty string/,
  );
});
