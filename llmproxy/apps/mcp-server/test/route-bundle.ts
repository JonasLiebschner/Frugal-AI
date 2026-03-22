import type { RouteBundle } from "../../shared/server/route-bundle";
import routeMcpDelete from "../server/routes/mcp.delete";
import routeMcpGet from "../server/routes/mcp.get";
import routeMcpPost from "../server/routes/mcp.post";
import routeMcpManifestGet from "../server/routes/mcp/manifest.get";

export const mcpRouteBundle: RouteBundle = {
  get: [
    { path: "/mcp", handler: routeMcpGet },
    { path: "/mcp/manifest", handler: routeMcpManifestGet },
  ],
  post: [
    { path: "/mcp", handler: routeMcpPost },
  ],
  delete: [
    { path: "/mcp", handler: routeMcpDelete },
  ],
};
