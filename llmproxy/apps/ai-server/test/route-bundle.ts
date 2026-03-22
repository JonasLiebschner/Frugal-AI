import type { RouteBundle } from "../../shared/server/route-bundle";
import {
  createRouteBundleTestLayer,
  type TestLayerRuntime,
} from "../../shared/test/test-layer-runtime";
import routeHealthzGet from "../server/routes/healthz.get";
import routeV1Fallback from "../server/routes/v1/[...path]";
import routeV1ChatCompletionsOptions from "../server/routes/v1/chat/completions.options";
import routeV1ChatCompletionsPost from "../server/routes/v1/chat/completions.post";
import routeV1ModelsGet from "../server/routes/v1/models.get";

export const aiServerRouteBundle: RouteBundle = {
  get: [
    { path: "/healthz", handler: routeHealthzGet },
    { path: "/v1/models", handler: routeV1ModelsGet },
  ],
  post: [
    { path: "/v1/chat/completions", handler: routeV1ChatCompletionsPost },
  ],
  options: [
    { path: "/v1/chat/completions", handler: routeV1ChatCompletionsOptions },
  ],
  use: [
    { path: "/v1/**", handler: routeV1Fallback },
  ],
};

export function createAiServerRouteBundleTestLayer(): TestLayerRuntime {
  return createRouteBundleTestLayer(aiServerRouteBundle);
}
