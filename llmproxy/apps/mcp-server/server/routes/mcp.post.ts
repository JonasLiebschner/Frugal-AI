import { defineEventHandler, getRequestURL, setResponseHeader, setResponseStatus } from "h3";
import {
  buildMcpJsonRpcErrorResponse,
  buildInvalidMcpJsonBodyResponse,
  MCP_DISABLED_MESSAGE,
  parseJsonRpcMessage,
} from "../mcp-protocol";
import {
  MCP_PROTOCOL_VERSION_HEADER,
  MCP_SESSION_ID_HEADER,
} from "../mcp-http-transport";
import { mcpError } from "../utils/error-response";
import { readJsonObjectBody } from "../../../shared/server/json-body";

export default defineEventHandler(async (event) => {
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

  const payload = await readJsonObjectBody(event);
  if (!payload) {
    setResponseStatus(event, 400);
    return buildInvalidMcpJsonBodyResponse();
  }

  const parsed = parseJsonRpcMessage(payload);
  if (parsed.kind === "invalid") {
    setResponseStatus(event, 400);
    return parsed.error;
  }

  if (parsed.kind === "response") {
    setResponseStatus(event, 202);
    return null;
  }

  if (parsed.kind === "notification") {
    const sessionId = event.headers.get(MCP_SESSION_ID_HEADER);
    const session = transport.getSession(sessionId);

    if (parsed.method === "notifications/initialized") {
      if (!sessionId) {
        setResponseStatus(event, 400);
        return buildMcpJsonRpcErrorResponse(undefined, -32002, "notifications/initialized requires an MCP session.");
      }

      if (!session || !transport.markInitialized(sessionId)) {
        setResponseStatus(event, 404);
        return buildMcpJsonRpcErrorResponse(undefined, -32002, "MCP session was not found.");
      }

      setResponseStatus(event, 202);
      setResponseHeader(event, MCP_SESSION_ID_HEADER, sessionId);
      setResponseHeader(event, MCP_PROTOCOL_VERSION_HEADER, session.protocolVersion);
      return null;
    }

    if (parsed.method === "notifications/cancelled" && sessionId && session) {
      transport.touchSession(sessionId);
    }

    setResponseStatus(event, 202);
    return null;
  }

  if (parsed.method === "initialize") {
    const initialized = transport.initialize(parsed.params);
    if ("response" in initialized) {
      setResponseStatus(event, 400);
      return initialized.response;
    }

    setResponseHeader(event, MCP_SESSION_ID_HEADER, initialized.session.id);
    setResponseHeader(event, MCP_PROTOCOL_VERSION_HEADER, initialized.session.protocolVersion);
    return {
      jsonrpc: "2.0",
      id: parsed.id,
      result: initialized.result,
    };
  }

  const sessionId = event.headers.get(MCP_SESSION_ID_HEADER);
  const session = transport.getSession(sessionId);
  if (!sessionId) {
    if (parsed.method === "ping") {
      return mcpServer.handleRequest(payload);
    }

    setResponseStatus(event, 400);
    return buildMcpJsonRpcErrorResponse(undefined, -32002, "MCP requests require an initialized session.");
  }

  if (!session) {
    setResponseStatus(event, 404);
    return buildMcpJsonRpcErrorResponse(undefined, -32002, "MCP session was not found.");
  }

  const protocolResolution = transport.resolveProtocolVersion(
    session,
    event.headers.get(MCP_PROTOCOL_VERSION_HEADER),
  );
  if ("response" in protocolResolution) {
    setResponseStatus(event, 400);
    return protocolResolution.response;
  }

  transport.touchSession(sessionId);
  setResponseHeader(event, MCP_SESSION_ID_HEADER, sessionId);
  setResponseHeader(event, MCP_PROTOCOL_VERSION_HEADER, protocolResolution.protocolVersion);

  if (!session.initialized && parsed.method !== "ping") {
    setResponseStatus(event, 400);
    return buildMcpJsonRpcErrorResponse(
      parsed.id,
      -32002,
      "MCP session is not initialized. Send notifications/initialized after initialize.",
    );
  }

  return mcpServer.handleRequest(payload);
});
