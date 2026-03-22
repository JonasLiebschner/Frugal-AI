export {
  createMcpHttpTransport,
  createMcpServerEventCapability,
  createMcpServerNitroCapability,
  createMcpServiceRegistry,
} from "./mcp-server-runtime";

import type {
  McpHttpTransport,
  McpManifest,
  McpRouteService,
  McpServiceHandler,
  McpServiceRegistry,
} from "./mcp-server-types";
import type {
  McpServerEventCapability as PublicMcpServerEventCapability,
  McpServerNitroCapability as PublicMcpServerNitroCapability,
} from "./mcp-server-runtime";

export type McpServerNitroCapability = PublicMcpServerNitroCapability;
export type McpServerRouteContext = McpRouteService<McpManifest>;
export type McpServerEventCapability = PublicMcpServerEventCapability;
export type {
  McpHttpTransport,
  McpManifest,
  McpRouteService,
  McpServiceHandler,
  McpServiceRegistry,
};
