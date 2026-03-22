import { setResponseHeader } from "h3";

import type { RouteBundle } from "../../shared/server/route-bundle";
import {
  createRouteBundleTestLayer,
  type TestLayerRuntime,
} from "../../shared/test/test-layer-runtime";
import { matchesRoutePattern, noStoreRoutePatterns } from "../server/llmproxy-dashboard";
import apiEventsGet from "../server/api/llmproxy/admin/events.get";
import apiStateGet from "../server/api/llmproxy/admin/state.get";
import apiConnectionsGet from "../server/api/llmproxy/admin/connections/index.get";
import apiConnectionsPost from "../server/api/llmproxy/admin/connections/index.post";
import apiConnectionDelete from "../server/api/llmproxy/admin/connections/[id]/index.delete";
import apiConnectionPatch from "../server/api/llmproxy/admin/connections/[id]/index.patch";
import apiConnectionPut from "../server/api/llmproxy/admin/connections/[id]/index.put";
import apiMcpClientServersGet from "../server/api/llmproxy/admin/mcp-client/servers/index.get";
import apiMcpClientServersPost from "../server/api/llmproxy/admin/mcp-client/servers/index.post";
import apiMcpClientServerDelete from "../server/api/llmproxy/admin/mcp-client/servers/[id]/index.delete";
import apiMcpClientServerPut from "../server/api/llmproxy/admin/mcp-client/servers/[id]/index.put";
import apiConfigServerPut from "../server/api/llmproxy/admin/config/server.put";
import apiDiagnosticsRequestGet from "../server/api/llmproxy/admin/diagnostics/requests/[id]/index.get";
import apiRequestCancelPost from "../server/api/llmproxy/admin/requests/[id]/cancel.post";
import apiRequestEventsGet from "../server/api/llmproxy/admin/requests/[id]/events.get";
import apiRequestGet from "../server/api/llmproxy/admin/requests/[id]/index.get";
import routeIndexGet from "../server/routes/index.get";
import routeDashboardConnectionsGet from "../server/routes/dashboard/connections.get";
import routeDashboardDiagnosticsGet from "../server/routes/dashboard/diagnostics.get";

const adminApiBase = "/api/llmproxy/admin";

export const llmproxyRouteBundle: RouteBundle = {
  get: [
    { path: "/", handler: routeIndexGet },
    { path: "/dashboard/connections", handler: routeDashboardConnectionsGet },
    { path: "/dashboard/diagnostics", handler: routeDashboardDiagnosticsGet },
    { path: `${adminApiBase}/events`, handler: apiEventsGet },
    { path: `${adminApiBase}/state`, handler: apiStateGet },
    { path: `${adminApiBase}/connections`, handler: apiConnectionsGet },
    { path: `${adminApiBase}/mcp-client/servers`, handler: apiMcpClientServersGet },
    { path: `${adminApiBase}/diagnostics/requests/:id`, handler: apiDiagnosticsRequestGet },
    { path: `${adminApiBase}/requests/:id/events`, handler: apiRequestEventsGet },
    { path: `${adminApiBase}/requests/:id`, handler: apiRequestGet },
  ],
  post: [
    { path: `${adminApiBase}/connections`, handler: apiConnectionsPost },
    { path: `${adminApiBase}/mcp-client/servers`, handler: apiMcpClientServersPost },
    { path: `${adminApiBase}/requests/:id/cancel`, handler: apiRequestCancelPost },
  ],
  put: [
    { path: `${adminApiBase}/connections/:id`, handler: apiConnectionPut },
    { path: `${adminApiBase}/mcp-client/servers/:id`, handler: apiMcpClientServerPut },
    { path: `${adminApiBase}/config/server`, handler: apiConfigServerPut },
  ],
  patch: [
    { path: `${adminApiBase}/connections/:id`, handler: apiConnectionPatch },
  ],
  delete: [
    { path: `${adminApiBase}/connections/:id`, handler: apiConnectionDelete },
    { path: `${adminApiBase}/mcp-client/servers/:id`, handler: apiMcpClientServerDelete },
  ],
};

export function createLlmproxyRouteBundleTestLayer(): TestLayerRuntime {
  return createRouteBundleTestLayer(llmproxyRouteBundle, (event) => {
    if (noStoreRoutePatterns.some((pattern) => matchesRoutePattern(event.path, pattern))) {
      setResponseHeader(event, "cache-control", "no-store");
    }
  });
}
