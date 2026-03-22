import { randomUUID } from "node:crypto";
import {
  buildMcpServerCapabilities,
  buildUnsupportedProtocolVersionResponse,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
  MCP_SERVER_INSTRUCTIONS,
} from "./mcp-protocol";
import { isRecord } from "../../shared/server/type-guards";
import type {
  McpHttpSession,
  McpHttpTransport,
  McpHttpTransportOptions,
} from "./mcp-server-types";

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60;

export const MCP_SESSION_ID_HEADER = "mcp-session-id";
export const MCP_PROTOCOL_VERSION_HEADER = "mcp-protocol-version";

export function createMcpHttpTransport(
  options: McpHttpTransportOptions = {},
): McpHttpTransport {
  const enabledResolver = options.isEnabled ?? (() => true);
  const supportedVersions = Array.from(
    new Set(options.supportedVersions ?? [MCP_PROTOCOL_VERSION, "2025-03-26"]),
  );
  const sessionTtlResolver = options.sessionTtlMs ?? (() => DEFAULT_SESSION_TTL_MS);
  const instructionsResolver = options.instructions ?? (() => MCP_SERVER_INSTRUCTIONS);
  const allowedOriginsResolver = options.allowedOrigins ?? (() => []);
  const sessions = new Map<string, McpHttpSession>();

  const cleanupExpiredSessions = () => {
    const now = Date.now();
    const ttlMs = Math.max(1000, sessionTtlResolver());

    for (const [sessionId, session] of sessions) {
      if ((now - session.lastSeenAt) > ttlMs) {
        sessions.delete(sessionId);
      }
    }
  };

  return {
    isEnabled: () => enabledResolver(),
    supportsOrigin: (request) => isAllowedOrigin(request, allowedOriginsResolver()),
    initialize: (params) => {
      cleanupExpiredSessions();
      const parsedParams = isRecord(params)
        ? params
        : {};
      const requestedProtocolVersion = typeof parsedParams.protocolVersion === "string"
        ? parsedParams.protocolVersion
        : undefined;

      if (requestedProtocolVersion && !supportedVersions.includes(requestedProtocolVersion)) {
        return {
          response: buildUnsupportedProtocolVersionResponse(requestedProtocolVersion, supportedVersions),
        };
      }

      const negotiatedVersion = requestedProtocolVersion ?? supportedVersions[0] ?? MCP_PROTOCOL_VERSION;
      const now = Date.now();
      const session: McpHttpSession = {
        id: randomUUID(),
        protocolVersion: negotiatedVersion,
        initialized: false,
        createdAt: now,
        lastSeenAt: now,
        ...(isRecord(parsedParams.capabilities) ? { clientCapabilities: parsedParams.capabilities } : {}),
        ...(isRecord(parsedParams.clientInfo) ? { clientInfo: parsedParams.clientInfo } : {}),
      };
      sessions.set(session.id, session);

      return {
        session,
        result: {
          protocolVersion: negotiatedVersion,
          capabilities: buildMcpServerCapabilities(),
          serverInfo: MCP_SERVER_INFO,
          instructions: instructionsResolver(),
        },
      };
    },
    getSession: (sessionId) => {
      cleanupExpiredSessions();
      if (!sessionId) {
        return undefined;
      }

      return sessions.get(sessionId);
    },
    resolveProtocolVersion: (session, headerValue) => {
      const protocolVersion = typeof headerValue === "string" && headerValue.trim().length > 0
        ? headerValue.trim()
        : session.protocolVersion;

      if (!supportedVersions.includes(protocolVersion) || protocolVersion !== session.protocolVersion) {
        return {
          response: buildUnsupportedProtocolVersionResponse(
            protocolVersion,
            [session.protocolVersion],
          ),
        };
      }

      return {
        protocolVersion,
      };
    },
    markInitialized: (sessionId) => {
      const session = sessions.get(sessionId);
      if (!session) {
        return false;
      }

      session.initialized = true;
      session.lastSeenAt = Date.now();
      return true;
    },
    touchSession: (sessionId) => {
      const session = sessions.get(sessionId);
      if (session) {
        session.lastSeenAt = Date.now();
      }
    },
    terminateSession: (sessionId) => {
      if (!sessionId) {
        return false;
      }

      return sessions.delete(sessionId);
    },
  };
}

function isAllowedOrigin(
  request: {
    originHeader: string | null;
    requestOrigin?: string | null;
  },
  allowedOrigins: readonly string[],
): boolean {
  const { originHeader, requestOrigin } = request;
  if (!originHeader) {
    return true;
  }

  try {
    const origin = new URL(originHeader);
    if (isLoopbackHostname(origin.hostname)) {
      return true;
    }

    const normalizedOrigin = origin.origin;
    if (normalizeOrigin(requestOrigin) === normalizedOrigin) {
      return true;
    }

    return allowedOrigins
      .map((entry) => normalizeOrigin(entry))
      .includes(normalizedOrigin);
  } catch {
    return false;
  }
}

function normalizeOrigin(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "[::1]";
}
