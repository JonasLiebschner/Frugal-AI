import type { RouteBundle } from "../../shared/server/route-bundle";
import {
  toolRegistryInternalServicesPath,
  toolRegistryInternalToolRoutePattern,
} from "../server/tool-registry-capability";
import apiInternalServicesGet from "../server/api/tool-registry/internal/services/index.get";
import apiInternalToolCallPost from "../server/api/tool-registry/internal/services/[serviceId]/tools/[toolName]/index.post";

export const toolRegistryRouteBundle: RouteBundle = {
  get: [
    { path: toolRegistryInternalServicesPath, handler: apiInternalServicesGet },
  ],
  post: [
    { path: toolRegistryInternalToolRoutePattern, handler: apiInternalToolCallPost },
  ],
};
