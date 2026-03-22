import type { RouteBundle } from "../../shared/server/route-bundle";
import routeConfigIndexGet from "../server/api/config/index.get";
import routeConfigIndexPut from "../server/api/config/index.put";
import routeConfigSchemaGet from "../server/api/config/schema.get";
import routeConfigIdGet from "../server/api/config/[id]/index.get";
import routeConfigIdPut from "../server/api/config/[id]/index.put";

export const configTestRouteBundle: RouteBundle = {
  get: [
    { path: "/api/config", handler: routeConfigIndexGet },
    { path: "/api/config/schema", handler: routeConfigSchemaGet },
    { path: "/api/config/:id", handler: routeConfigIdGet },
  ],
  put: [
    { path: "/api/config", handler: routeConfigIndexPut },
    { path: "/api/config/:id", handler: routeConfigIdPut },
  ],
};
