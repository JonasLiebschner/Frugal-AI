import type { RouteBundle } from "../../shared/server/route-bundle";
import { aiServerTestRouteBundle } from "../../ai-server/test/runtime-api";
import {
  aiProxyInternalRequestDiagnosticsRoutePattern,
  aiProxyInternalRequestRoutePattern,
  aiProxyInternalRequestsPath,
} from "../server/ai-proxy-capability";
import apiInternalDiagnosticsRequestGet from "../server/api/ai-proxy/internal/diagnostics/requests/[id]/index.get";
import apiInternalRequestGet from "../server/api/ai-proxy/internal/requests/[id]/index.get";
import apiInternalRequestsGet from "../server/api/ai-proxy/internal/requests/index.get";

export const aiProxyRouteBundle: RouteBundle = {
  get: [
    ...(aiServerTestRouteBundle.get ?? []),
    { path: aiProxyInternalRequestsPath, handler: apiInternalRequestsGet },
    { path: aiProxyInternalRequestRoutePattern, handler: apiInternalRequestGet },
    { path: aiProxyInternalRequestDiagnosticsRoutePattern, handler: apiInternalDiagnosticsRequestGet },
  ],
  post: aiServerTestRouteBundle.post,
  use: aiServerTestRouteBundle.use,
};
