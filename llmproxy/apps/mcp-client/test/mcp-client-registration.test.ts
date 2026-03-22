import assert from "node:assert/strict";
import test from "node:test";

import {
  createMcpClientService,
} from "../server/mcp-client-capability";

test("mcp-client stores registered external MCP servers", () => {
  const service = createMcpClientService();

  service.registerServer(() => ({
    id: "remote-docs",
    title: "Remote docs MCP",
    endpoint: "https://example.com/mcp",
    description: "External documentation MCP server.",
    transport: "streamable-http",
    protocolVersion: "2025-11-25",
    headers: {
      authorization: "Bearer test",
    },
  }));

  const servers = service.listServers();
  assert.equal(servers.length, 1);
  assert.deepEqual(servers[0], {
    id: "remote-docs",
    title: "Remote docs MCP",
    endpoint: "https://example.com/mcp",
    description: "External documentation MCP server.",
    transport: "streamable-http",
    protocolVersion: "2025-11-25",
    headers: {
      authorization: "Bearer test",
    },
  });
});
