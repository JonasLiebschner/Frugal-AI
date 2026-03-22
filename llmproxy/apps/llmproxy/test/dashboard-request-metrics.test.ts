import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecentRequestMetrics,
  buildRequestResponseMetricRows,
} from "../app/utils/dashboard-request-metrics";
import {
  buildCompletionMetricValue,
  resolveServedModelName,
} from "../app/utils/dashboard-request-completion";

test("buildRecentRequestMetrics renders timing and token throughput badges", () => {
  const badges = buildRecentRequestMetrics({
    id: "req-1",
    time: "2026-03-21T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    outcome: "success",
    latencyMs: 250,
    queuedMs: 10,
    promptTokens: 12,
    completionTokens: 34,
    totalTokens: 46,
    contentTokens: 20,
    reasoningTokens: 9,
    textTokens: 5,
    timeToFirstTokenMs: 120,
    generationMs: 800,
    completionTokensPerSecond: 42.5,
  });

  assert.deepEqual(badges.map((badge) => badge.text), [
    "prompt 12",
    "completion 34",
    "total 46",
    "content 20",
    "reasoning 9",
    "text 5",
    "ttfb 120ms",
    "gen 800ms",
    "42.5 tok/s",
  ]);
});

test("buildRequestResponseMetricRows includes middleware routing and effective token limits", () => {
  const rows = buildRequestResponseMetricRows({
    id: "req-2",
    time: "2026-03-21T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    model: "middleware:router-a",
    routingMiddlewareId: "router-a",
    routingMiddlewareProfile: "small",
    backendId: "backend-a",
    backendName: "Backend A",
    outcome: "success",
    latencyMs: 400,
    queuedMs: 20,
    statusCode: 200,
    completionTokens: 8,
    energyUsageWh: 0.0832,
    timeToFirstTokenMs: 90,
    generationMs: 500,
    finishReason: "stop",
  }, {
    requestBody: {
      model: "middleware:router-a",
      max_completion_tokens: 24,
    },
    responseBody: {
      model: "gpt-4.1-mini",
    },
    backends: [{
      id: "backend-a",
      name: "Backend A",
      baseUrl: "https://example.com",
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
      configuredModels: [],
      discoveredModels: ["gpt-4.1-mini"],
      discoveredModelDetails: [{
        id: "gpt-4.1-mini",
        metadata: {
          max_output_tokens: 48,
        },
      }],
    }],
  });

  assert.equal(rows.find((row) => row.key === "Routing middleware")?.value, "router-a");
  assert.equal(rows.find((row) => row.key === "Routing outcome")?.value, "small");
  assert.equal(rows.find((row) => row.key === "Energy usage")?.value, "0.083 Wh");
  assert.equal(rows.find((row) => row.key === "Model")?.value, "gpt-4.1-mini");
  assert.equal(rows.find((row) => row.key === "Completion tokens")?.value, "8 / 24 tokens");
});

test("resolveServedModelName prefers response body over request and fallback", () => {
  assert.equal(resolveServedModelName(
    { model: "gpt-4.1-mini" },
    { model: "middleware:router-a" },
    "auto",
  ), "gpt-4.1-mini");
  assert.equal(resolveServedModelName(
    null,
    { model: "gpt-4.1-nano" },
    "auto",
  ), "gpt-4.1-nano");
});

test("buildCompletionMetricValue uses the lower of request and model caps", () => {
  const metric = buildCompletionMetricValue({
    id: "req-3",
    time: "2026-03-21T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    model: "gpt-4.1-mini",
    backendId: "backend-a",
    outcome: "success",
    latencyMs: 400,
    queuedMs: 20,
    completionTokens: 12,
  }, {
    requestBody: {
      max_completion_tokens: 48,
    },
    responseBody: {
      model: "gpt-4.1-mini",
    },
    backends: [{
      id: "backend-a",
      name: "Backend A",
      baseUrl: "https://example.com",
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
      configuredModels: [],
      discoveredModels: ["gpt-4.1-mini"],
      discoveredModelDetails: [{
        id: "gpt-4.1-mini",
        metadata: {
          max_output_tokens: 24,
        },
      }],
    }],
  });

  assert.equal(metric?.value, "12 / 24 tokens");
  assert.match(metric?.title ?? "", /Effective limit uses the lower of the request cap/);
});
