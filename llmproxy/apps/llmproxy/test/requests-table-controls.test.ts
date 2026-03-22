import assert from "node:assert/strict";
import test from "node:test";

import type { RequestCatalogRow } from "../app/utils/request-catalog";
import {
  createRequestTableFilters,
  filterRequestEntries,
  hasActiveRequestFilters,
  normalizeOutcomeFilterValue,
  resetRequestFilters,
  sortRequestEntries,
} from "../app/utils/requests-table-controls";
import {
  buildBackendOptions,
  buildFinishReasonOptions,
  buildMiddlewareOptions,
  buildModelOptions,
  buildOutcomeOptions,
  buildRoutingOptions,
} from "../app/utils/requests-table-options";

function requestRow(overrides: Partial<RequestCatalogRow> = {}): RequestCatalogRow {
  return {
    id: "req-1",
    time: "2026-03-21T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    requestType: "json",
    model: "gpt-4.1-mini",
    routingMiddlewareId: "router-a",
    routingMiddlewareProfile: "small",
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

test("normalizeOutcomeFilterValue only keeps supported request outcome values", () => {
  assert.equal(normalizeOutcomeFilterValue(undefined), "all");
  assert.equal(normalizeOutcomeFilterValue(" success "), "success");
  assert.equal(normalizeOutcomeFilterValue("finish:length"), "finish:length");
  assert.equal(normalizeOutcomeFilterValue("bogus"), "all");
});

test("filterRequestEntries combines outcome, model, issue, and numeric filters", () => {
  const filters = createRequestTableFilters();
  filters.outcome = "success";
  filters.model = "gpt-4.1-mini";
  filters.middleware = "router-a";
  filters.routing = "small";
  filters.tokensComparator = "gte";
  filters.tokensValue = "40";
  filters.energyComparator = "gte";
  filters.energyValue = "0.05";
  filters.issues = "clean";

  const entries = [
    requestRow({ energyUsageWh: 0.06 }),
    requestRow({
      id: "req-2",
      model: "gpt-5-mini",
      routingMiddlewareId: "router-b",
      routingMiddlewareProfile: "large",
      completionTokens: 20,
      energyUsageWh: 0.1,
    }),
    requestRow({
      id: "req-3",
      outcome: "error",
      error: "Upstream failed",
      completionTokens: undefined,
      totalTokens: undefined,
      contentTokens: undefined,
      reasoningTokens: undefined,
      textTokens: undefined,
      diagnosticSeverity: "warn",
      energyUsageWh: 0.02,
    }),
  ];

  const filtered = filterRequestEntries(entries, filters, (value) => value.slice(0, 8));
  assert.deepEqual(filtered.map((entry) => entry.id), ["req-1"]);
});

test("sortRequestEntries sorts stably by numeric request metrics", () => {
  const sorted = sortRequestEntries([
    requestRow({ id: "req-1", completionTokens: 20 }),
    requestRow({ id: "req-2", completionTokens: 10 }),
    requestRow({ id: "req-3", completionTokens: 20 }),
  ], "tokens", "asc");

  assert.deepEqual(sorted.map((entry) => entry.id), ["req-2", "req-1", "req-3"]);
});

test("request table controls expose distinct option sets and reset active filters", () => {
  const entries = [
    requestRow({ live: true, outcome: "queued", finishReason: undefined }),
    requestRow({ id: "req-2", model: "gpt-5-mini", backendName: "Secondary", finishReason: "length" }),
  ];

  assert.deepEqual(buildOutcomeOptions(entries), [
    { value: "all", label: "All" },
    { value: "queued", label: "Queued" },
    { value: "success", label: "Successful" },
    { value: "error", label: "Failed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "rejected", label: "Rejected" },
    { value: "queued_timeout", label: "Queue timeout" },
  ]);
  assert.deepEqual(buildFinishReasonOptions(entries), [
    { value: "all", label: "All finish reasons" },
    { value: "none", label: "None" },
    { value: "length", label: "length" },
  ]);
  assert.deepEqual(buildModelOptions(entries), [
    { value: "all", label: "All models" },
    { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
    { value: "gpt-5-mini", label: "gpt-5-mini" },
  ]);
  assert.deepEqual(buildMiddlewareOptions(entries), [
    { value: "all", label: "All middlewares" },
    { value: "router-a", label: "router-a" },
  ]);
  assert.deepEqual(buildRoutingOptions(entries), [
    { value: "all", label: "All routing outcomes" },
    { value: "small", label: "small" },
  ]);
  assert.deepEqual(buildBackendOptions(entries), [
    { value: "all", label: "All backends" },
    { value: "Primary", label: "Primary" },
    { value: "Secondary", label: "Secondary" },
  ]);

  const filters = createRequestTableFilters();
  filters.outcome = "success";
  filters.middleware = "router-a";
  filters.note = "error";
  filters.energyComparator = "gte";
  filters.energyValue = "0.01";
  assert.equal(hasActiveRequestFilters(filters), true);

  resetRequestFilters(filters);
  assert.equal(hasActiveRequestFilters(filters), false);
});
