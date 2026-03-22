import assert from "node:assert/strict";
import test from "node:test";

import type { RequestCatalogRow } from "../app/utils/request-catalog";
import {
  diagnosticIssueTitle,
  finishReasonTitle,
  matchesOutcomeFilter,
  outcomeLabel,
} from "../app/utils/requests-table-outcomes";

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

test("matchesOutcomeFilter keeps rejected requests separate from backend failures", () => {
  const rejectedEntry = requestRow({
    backendId: undefined,
    backendName: undefined,
    outcome: "error",
  });
  const failedEntry = requestRow({
    outcome: "error",
  });

  assert.equal(matchesOutcomeFilter(rejectedEntry, "rejected"), true);
  assert.equal(matchesOutcomeFilter(rejectedEntry, "error"), false);
  assert.equal(matchesOutcomeFilter(failedEntry, "error"), true);
  assert.equal(matchesOutcomeFilter(failedEntry, "rejected"), false);
});

test("outcomeLabel formats queue timeout distinctly", () => {
  assert.equal(outcomeLabel(requestRow({ outcome: "queued_timeout" })), "queue timeout");
});

test("finishReasonTitle explains missing or present finish reasons", () => {
  assert.match(finishReasonTitle(requestRow({ finishReason: "length" })), /token limit/i);
  assert.match(finishReasonTitle(requestRow({ finishReason: undefined, live: true })), /not reached a final backend response state/i);
  assert.match(finishReasonTitle(requestRow({ finishReason: undefined, live: false })), /did not report a finish reason/i);
});

test("diagnosticIssueTitle combines title and summary when available", () => {
  const entry = requestRow({
    diagnosticSeverity: "warn",
    diagnosticTitle: "Latency spike",
    diagnosticSummary: "Observed unusually slow upstream response.",
  });

  assert.equal(
    diagnosticIssueTitle(entry),
    "Latency spike: Observed unusually slow upstream response.",
  );
  assert.equal(
    diagnosticIssueTitle(requestRow()),
    "No heuristic issue detected for this stored request.",
  );
});
