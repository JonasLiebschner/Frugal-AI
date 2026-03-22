import assert from "node:assert/strict";
import test from "node:test";

import type { RequestCatalogRow } from "../app/utils/request-catalog";
import {
  energyUsageSummary,
  entryTokenCount,
  formatLogDate,
  formatLogTime,
  maxTokensSummary,
  noteSummary,
  routingMiddlewareLabel,
  routingProfileLabel,
  routingTitle,
  tokenCountSummary,
  tokenRateSummary,
} from "../app/utils/requests-table-display";

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

test("entryTokenCount prefers explicit counts and derives fallback totals", () => {
  assert.equal(entryTokenCount(requestRow()), 48);
  assert.equal(entryTokenCount(requestRow({
    completionTokens: undefined,
    totalTokens: undefined,
    contentTokens: 10,
    reasoningTokens: 5,
    textTokens: 3,
  })), 18);
  assert.equal(entryTokenCount(requestRow({
    completionTokens: undefined,
    totalTokens: undefined,
    contentTokens: undefined,
    reasoningTokens: undefined,
    textTokens: undefined,
    effectiveCompletionTokenLimit: 256,
  })), 0);
});

test("request table display helpers render note and token summaries", () => {
  assert.equal(tokenCountSummary(requestRow({ completionTokens: 1024 })), "1,024 tok");
  assert.equal(tokenCountSummary(requestRow({
    completionTokens: undefined,
    totalTokens: undefined,
    contentTokens: undefined,
    reasoningTokens: undefined,
    textTokens: undefined,
    effectiveCompletionTokenLimit: undefined,
  })), "-");
  assert.equal(noteSummary(requestRow({ error: "Upstream failed" })), "Upstream failed");
  assert.equal(noteSummary(requestRow()), "");
  assert.equal(tokenRateSummary(requestRow({ completionTokensPerSecond: 24 })), "24.0 tok/s");
  assert.equal(tokenRateSummary(requestRow({ completionTokensPerSecond: undefined })), "-");
  assert.equal(maxTokensSummary(requestRow({ effectiveCompletionTokenLimit: 1024 })), "1,024 tok");
  assert.equal(maxTokensSummary(requestRow({ effectiveCompletionTokenLimit: undefined })), "\u221E");
  assert.equal(energyUsageSummary(requestRow({ energyUsageWh: 0.0832 })), "0.083 Wh");
  assert.equal(energyUsageSummary(requestRow({ energyUsageWh: undefined })), "-");
  assert.equal(routingMiddlewareLabel(requestRow({
    routingMiddlewareId: "router-a",
    routingMiddlewareProfile: "small",
  })), "router-a");
  assert.equal(routingProfileLabel(requestRow({
    routingMiddlewareId: "router-a",
    routingMiddlewareProfile: "small",
  })), "small");
  assert.equal(routingMiddlewareLabel(requestRow()), "-");
  assert.equal(routingProfileLabel(requestRow()), "-");
  assert.equal(routingTitle(requestRow({
    routingMiddlewareId: "router-a",
    routingMiddlewareProfile: "small",
  })), "AI request middleware selection and routing outcome returned before llmproxy resolved the final model.");
});

test("request table date display helpers format log timestamps", () => {
  assert.equal(formatLogDate("2026-03-21T12:00:00.000Z"), "3/21/26");
  assert.notEqual(formatLogTime("2026-03-21T12:00:00.000Z"), "");
});
