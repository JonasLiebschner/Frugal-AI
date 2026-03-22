import assert from "node:assert/strict";
import test from "node:test";
import { buildProxyRouteResponseHeaders } from "../server/utils/proxy-route-response-headers";

test("buildProxyRouteResponseHeaders includes routing middleware metadata when present", () => {
  assert.deepEqual(buildProxyRouteResponseHeaders({
    requestId: "req-1",
    backendId: "backend-a",
    model: "gpt-4.1-mini",
    routingMiddlewareId: "router-a",
    routingMiddlewareProfile: "small",
  }), {
    "x-ai-proxy-request-id": "req-1",
    "x-ai-proxy-backend": "backend-a",
    "x-ai-proxy-model": "gpt-4.1-mini",
    "x-ai-proxy-routing-middleware": "router-a",
    "x-ai-proxy-routing-outcome": "small",
  });
});

test("buildProxyRouteResponseHeaders omits optional routing headers when absent", () => {
  assert.deepEqual(buildProxyRouteResponseHeaders({
    requestId: "req-1",
    backendId: "backend-a",
  }), {
    "x-ai-proxy-request-id": "req-1",
    "x-ai-proxy-backend": "backend-a",
  });
});
