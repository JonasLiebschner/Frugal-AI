import { defineEventHandler, getRequestURL, setResponseStatus } from "h3";
import {
  buildMcpJsonRpcErrorResponse,
  MCP_DISABLED_MESSAGE,
} from "../mcp-protocol";
import { mcpError } from "../utils/error-response";

export default defineEventHandler((event) => {
  const mcpServer = event.context.mcpServer;
  const transport = mcpServer.transport;

  if (!mcpServer.isEnabled()) {
    setResponseStatus(event, 503);
    return mcpError(MCP_DISABLED_MESSAGE, "mcp_disabled");
  }

  if (!transport) {
    setResponseStatus(event, 500);
    return mcpError("MCP transport is unavailable.", "mcp_transport_unavailable");
  }

  if (!transport.supportsOrigin({
    originHeader: event.headers.get("origin"),
    requestOrigin: getRequestURL(event, {
      xForwardedHost: true,
      xForwardedProto: true,
    }).origin,
  })) {
    setResponseStatus(event, 403);
    return buildMcpJsonRpcErrorResponse(undefined, -32001, "Origin is not allowed for MCP HTTP requests.");
  }

  setResponseStatus(event, 405);
  return buildMcpJsonRpcErrorResponse(
    undefined,
    -32601,
    "This MCP server does not expose an SSE stream over GET /mcp.",
  );
});
