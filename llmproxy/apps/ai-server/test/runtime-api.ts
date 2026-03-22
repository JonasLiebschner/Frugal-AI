import type { TestLayerRuntime } from "../../shared/test/test-layer-runtime";
import {
  aiServerRouteBundle,
  createAiServerRouteBundleTestLayer,
} from "./route-bundle";

export interface AiServerTestRuntime extends TestLayerRuntime {}
export const aiServerTestRouteBundle = aiServerRouteBundle;

export function createAiServerTestRuntime(): AiServerTestRuntime {
  return createAiServerRouteBundleTestLayer();
}
