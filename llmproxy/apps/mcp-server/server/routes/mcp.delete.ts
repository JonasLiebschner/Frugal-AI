import { defineEventHandler, getRequestURL, setResponseStatus } from "h3";
import {
  MCP_PROTOCOL_VERSION_HEADER,
  MCP_SESSION_ID_HEADER,
} from "../mcp-http-transport";
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

  const sessionId = event.headers.get(MCP_SESSION_ID_HEADER);
  if (!sessionId) {
    setResponseStatus(event, 400);
    return buildMcpJsonRpcErrorResponse(undefined, -32002, "DELETE /mcp requires an MCP session id.");
  }

  if (!transport.terminateSession(sessionId)) {
    setResponseStatus(event, 404);
    return buildMcpJsonRpcErrorResponse(undefined, -32002, "MCP session was not found.");
  }

  event.node.res.removeHeader(MCP_SESSION_ID_HEADER);
  event.node.res.removeHeader(MCP_PROTOCOL_VERSION_HEADER);
  setResponseStatus(event, 204);
  return null;
});
