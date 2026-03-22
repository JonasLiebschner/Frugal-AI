import assert from "node:assert/strict";
import test from "node:test";

import type { RequestCatalogRow } from "../app/utils/request-catalog";
import { compareRequestEntries } from "../app/utils/requests-table-sorting";

function requestRow(overrides: Partial<RequestCatalogRow> = {}): RequestCatalogRow {
  return {
    id: "req-1",
    time: "2026-03-21T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    requestType: "json",
    model: "gpt-4.1-mini",
    backendName: "Primary",
    backendId: "backend-1",
    outcome: "success",
    queuedMs: 12,
    latencyMs: 240,
    statusCode: 200,
    error: "",
    completionTokens: 48,
    totalTokens: 60,
    contentTokens: 32,
    reasoningTokens: 8,
    textTokens: 8,
    completionTokensPerSecond: 24,
    effectiveCompletionTokenLimit: 128,
    finishReason: "stop",
    diagnosticSeverity: undefined,
    diagnosticTitle: undefined,
    diagnosticSummary: undefined,
    hasDetail: true,
    live: false,
    ...overrides,
  };
}

test("compareRequestEntries sorts token counts before missing values", () => {
  const withTokens = requestRow({ completionTokens: 12 });
  const withoutTokens = requestRow({
    id: "req-2",
    completionTokens: undefined,
    totalTokens: undefined,
    contentTokens: undefined,
    reasoningTokens: undefined,
    textTokens: undefined,
    effectiveCompletionTokenLimit: undefined,
  });

  assert.equal(compareRequestEntries(withTokens, withoutTokens, "tokens") < 0, true);
  assert.equal(compareRequestEntries(withoutTokens, withTokens, "tokens") > 0, true);
});

test("compareRequestEntries uses formatted outcome labels", () => {
  const queueTimeout = requestRow({ outcome: "queued_timeout" });
  const success = requestRow({ id: "req-2", outcome: "success" });

  assert.equal(compareRequestEntries(queueTimeout, success, "outcome") < 0, true);
});

test("compareRequestEntries falls back to request notes for note sorting", () => {
  const alpha = requestRow({ error: "alpha issue" });
  const beta = requestRow({ id: "req-2", error: "beta issue" });

  assert.equal(compareRequestEntries(alpha, beta, "note") < 0, true);
  assert.equal(compareRequestEntries(beta, alpha, "note") > 0, true);
});

test("compareRequestEntries sorts middleware and routing outcomes alphabetically", () => {
  const alphaMiddleware = requestRow({ routingMiddlewareId: "router-a", routingMiddlewareProfile: "small" });
  const betaMiddleware = requestRow({ id: "req-2", routingMiddlewareId: "router-b", routingMiddlewareProfile: "large" });

  assert.equal(compareRequestEntries(alphaMiddleware, betaMiddleware, "middleware") < 0, true);
  assert.equal(compareRequestEntries(betaMiddleware, alphaMiddleware, "routing") < 0, true);
});

test("compareRequestEntries sorts energy usage numerically before missing values", () => {
  const lowerEnergy = requestRow({ energyUsageWh: 0.032 });
  const higherEnergy = requestRow({ id: "req-2", energyUsageWh: 0.120 });
  const missingEnergy = requestRow({ id: "req-3", energyUsageWh: undefined });

  assert.equal(compareRequestEntries(lowerEnergy, higherEnergy, "energy") < 0, true);
  assert.equal(compareRequestEntries(lowerEnergy, missingEnergy, "energy") < 0, true);
});
