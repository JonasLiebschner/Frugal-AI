export { createToolRegistryServiceRegistry } from "./tool-registry-runtime";
export {
  buildToolRegistryInternalToolPath,
  toolRegistryInternalServicesPath,
  toolRegistryInternalToolRoutePattern,
} from "./tool-registry-internal-routes";

import type { RequestFetch } from "../../shared/server/request-fetch";
import type {
  ToolProvider,
  ToolCallResult,
  ToolDefinition,
  ToolRegistration,
  ToolRegistrar,
  ToolRegistryRouteContext,
  ToolRegistryServiceDefinition,
  ToolRegistryServiceMetadata,
  ToolRegistryServiceRegistry,
  ToolRegistryServiceRegistryOptions,
} from "./tool-registry-types";

export type {
  ToolCallResult,
  ToolDefinition,
  ToolProvider,
  ToolRegistration,
  ToolRegistrar,
  ToolRegistryRouteContext,
  ToolRegistryServiceDefinition,
  ToolRegistryServiceMetadata,
  ToolRegistryServiceRegistry,
  ToolRegistryServiceRegistryOptions,
};

export type ToolRegistryNitroCapability = ToolRegistryServiceRegistry<RequestFetch>;
