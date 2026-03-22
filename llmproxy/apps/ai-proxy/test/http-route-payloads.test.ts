import assert from "node:assert/strict";
import test from "node:test";
import { buildHealthPayload, buildModelsPayload } from "../server/ai-proxy-routing";

test("buildHealthPayload summarizes backend health from the snapshot", () => {
  assert.deepEqual(
    buildHealthPayload({
      startedAt: "2026-03-16T00:00:00.000Z",
      queueDepth: 3,
      recentRequestLimit: 1000,
      totals: {
        activeRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        cancelledRequests: 0,
        rejectedRequests: 0,
      },
      backends: [
        {
          id: "healthy",
          name: "Healthy",
          baseUrl: "http://healthy",
          connector: "openai",
          enabled: true,
          healthy: true,
          activeRequests: 0,
          availableSlots: 1,
          maxConcurrency: 1,
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          cancelledRequests: 0,
          configuredModels: ["model-a"],
          discoveredModels: [],
          discoveredModelDetails: [],
        },
        {
          id: "disabled",
          name: "Disabled",
          baseUrl: "http://disabled",
          connector: "openai",
          enabled: false,
          healthy: true,
          activeRequests: 0,
          availableSlots: 1,
          maxConcurrency: 1,
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          cancelledRequests: 0,
          configuredModels: ["model-b"],
          discoveredModels: [],
          discoveredModelDetails: [],
        },
      ],
      activeConnections: [],
      recentRequests: [],
    }),
    {
      status: "ok",
      queueDepth: 3,
      backends: 2,
      healthyBackends: 1,
    },
  );
});

test("buildModelsPayload keeps the OpenAI-compatible list envelope", () => {
  assert.deepEqual(
    buildModelsPayload([
      {
        id: "model-a",
        backendId: "backend-a",
        ownedBy: "backend-a",
        source: "configured",
      },
    ]),
    {
      object: "list",
      data: [
        {
          id: "model-a",
          object: "model",
          created: 0,
          owned_by: "",
        },
      ],
    },
  );
});

test("buildModelsPayload appends virtual middleware selector models with routing metadata", () => {
  assert.deepEqual(
    buildModelsPayload(
      [
        {
          id: "model-a",
          backendId: "backend-a",
          ownedBy: "backend-a",
          source: "configured",
        },
      ],
      [
        {
          id: "router-a",
          url: "https://router.example.com/api/v1/classify",
          models: {
            small: "gpt-4.1-mini",
            large: "gpt-5",
          },
        },
      ],
    ),
    {
      object: "list",
      data: [
        {
          id: "model-a",
          object: "model",
          created: 0,
          owned_by: "",
        },
        {
          id: "middleware:router-a",
          object: "model",
          created: 0,
          owned_by: "llmproxy.middleware",
          metadata: {
            llmproxy: {
              kind: "routing_middleware",
              middleware_id: "router-a",
              selector: "middleware:router-a",
              url: "https://router.example.com/api/v1/classify",
              target_models: {
                small: "gpt-4.1-mini",
                large: "gpt-5",
              },
            },
          },
        },
      ],
    },
  );
});
