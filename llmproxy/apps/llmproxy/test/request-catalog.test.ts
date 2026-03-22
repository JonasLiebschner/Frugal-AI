import assert from "node:assert/strict";
import test from "node:test";

import { normalizeActiveConnectionRow } from "../app/utils/request-catalog";
import type { ActiveConnectionSnapshot } from "../app/types/dashboard";

test("normalizeActiveConnectionRow keeps middleware routing metadata for live requests", () => {
  const connection: ActiveConnectionSnapshot = {
    id: "req-live-1",
    kind: "chat.completions",
    method: "POST",
    path: "/v1/chat/completions",
    model: "gpt-4.1-mini",
    routingMiddlewareId: "router-a",
    routingMiddlewareProfile: "small",
    clientStream: true,
    upstreamStream: true,
    phase: "streaming",
    startedAt: "2026-03-21T12:00:00.000Z",
    elapsedMs: 320,
    queueMs: 24,
    backendId: "primary",
    backendName: "Primary",
    contentTokens: 32,
    reasoningTokens: 4,
    textTokens: 28,
    metricsExact: true,
    hasDetail: true,
  };

  assert.deepEqual(normalizeActiveConnectionRow(connection), {
    id: "req-live-1",
    time: "2026-03-21T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    requestType: "stream",
    model: "gpt-4.1-mini",
    routingMiddlewareId: "router-a",
    routingMiddlewareProfile: "small",
    backendName: "Primary",
    backendId: "primary",
    outcome: "streaming",
    queuedMs: 24,
    latencyMs: 320,
    statusCode: undefined,
    error: undefined,
    completionTokens: undefined,
    totalTokens: undefined,
    contentTokens: 32,
    reasoningTokens: 4,
    textTokens: 28,
    completionTokensPerSecond: undefined,
    effectiveCompletionTokenLimit: undefined,
    energyUsageWh: undefined,
    finishReason: undefined,
    diagnosticSeverity: undefined,
    diagnosticTitle: undefined,
    diagnosticSummary: undefined,
    hasDetail: true,
    live: true,
  });
});
