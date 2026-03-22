import type { RequestFetch } from "../../shared/server/request-fetch";
import type { JsonSchemaValidationService } from "../../json-schema/server/json-schema-capability";
import type { TestLayerRuntime } from "../../shared/test/test-layer-runtime";
import {
  createRequestFetchBoundRouteBundleTestRuntime,
} from "../../shared/test/test-layer-runtime";
import type { ToolRegistryServiceRegistry } from "../server/tool-registry-capability";
import {
  createToolRegistryServiceRegistry,
} from "../server/tool-registry-capability";
import { toolRegistryRouteBundle } from "./route-bundle";

export interface ToolRegistryTestRuntimeOptions {
  validation?: JsonSchemaValidationService;
}

export interface ToolRegistryTestRuntime extends TestLayerRuntime {
  toolRegistry: ToolRegistryServiceRegistry<RequestFetch>;
}

export function createToolRegistryTestRegistry<TContext = any>(
  options: ToolRegistryTestRuntimeOptions = {},
): ToolRegistryServiceRegistry<TContext> {
  return createToolRegistryServiceRegistry<TContext>({
    validation: options.validation,
  });
}

export function createToolRegistryTestRuntime(
  options: ToolRegistryTestRuntimeOptions = {},
): ToolRegistryTestRuntime {
  const toolRegistry = createToolRegistryTestRegistry<RequestFetch>(options);
  return createRequestFetchBoundRouteBundleTestRuntime(
    "toolRegistry",
    toolRegistry,
    toolRegistryRouteBundle,
    { toolRegistry },
  );
}
export { toolRegistryRouteBundle };
