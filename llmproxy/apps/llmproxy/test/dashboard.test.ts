import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDashboardSubPath, resolveDashboardLandingPage } from "../server/llmproxy-dashboard";
import type { ProxySnapshot } from "../../shared/type-api";

const snapshot: ProxySnapshot = {
  startedAt: new Date(0).toISOString(),
  queueDepth: 0,
  recentRequestLimit: 1000,
  totals: {
    activeRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    cancelledRequests: 0,
    rejectedRequests: 0,
  },
  backends: [],
  activeConnections: [],
  recentRequests: [],
};

test("normalizeDashboardSubPath strips trailing slashes without changing root", () => {
  assert.equal(normalizeDashboardSubPath("/dashboard/"), "/dashboard");
  assert.equal(normalizeDashboardSubPath("/dashboard/logs/"), "/dashboard/logs");
  assert.equal(normalizeDashboardSubPath("/"), "/");
});

test("dashboard landing page defaults to config when no backends are configured", () => {
  assert.equal(resolveDashboardLandingPage(snapshot), "config");
});

test("dashboard landing page defaults to overview when backends are configured", () => {
  assert.equal(resolveDashboardLandingPage({
    ...snapshot,
    backends: [
      {
        id: "backend-a",
        name: "Backend A",
        baseUrl: "http://127.0.0.1:8080",
        connector: "openai",
        enabled: true,
        healthy: true,
        maxConcurrency: 1,
        activeRequests: 0,
        availableSlots: 1,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        cancelledRequests: 0,
        configuredModels: ["*"],
        discoveredModels: [],
        discoveredModelDetails: [],
      },
    ],
  }), "overview");
});
