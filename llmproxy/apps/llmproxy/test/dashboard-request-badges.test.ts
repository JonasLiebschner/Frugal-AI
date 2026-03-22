import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecentRequestBadges,
  buildRequestRoutingBadges,
  buildRequestStateBadge,
} from "../app/utils/dashboard-request-badges";
import { buildRequestParamRows } from "../app/utils/dashboard-request-params";
import { formatDate } from "../app/utils/formatters";

test("buildRequestStateBadge reflects live and final request outcomes", () => {
  assert.equal(buildRequestStateBadge(undefined), null);
  assert.deepEqual(buildRequestStateBadge({
    id: "req-1",
    time: "2026-03-21T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    outcome: "success",
    latencyMs: 250,
    queuedMs: 12,
  }, true), {
    text: "running",
    tone: "warn",
    title: "This request is still active and has not reached a final state yet.",
  });
  assert.deepEqual(buildRequestStateBadge({
    id: "req-2",
    time: "2026-03-21T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    outcome: "queued_timeout",
    latencyMs: 250,
    queuedMs: 12,
  }), {
    text: "queue timeout",
    tone: "warn",
    title: "The request timed out while waiting in the queue.",
  });
});

test("buildRequestParamRows keeps request type and strips bulky transcript fields", () => {
  const rows = buildRequestParamRows({
    stream: true,
    model: "middleware:router-a",
    max_completion_tokens: 512,
    temperature: 0.4,
    messages: [{ role: "user", content: "Hello" }],
    tools: [{ type: "function" }],
  });

  assert.deepEqual(rows.map((row) => row.key), [
    "type",
    "model",
    "max_completion_tokens",
    "temperature",
  ]);
  assert.equal(rows[0]?.value, "stream");
});

test("buildRecentRequestBadges includes middleware and detail hints", () => {
  const badges = buildRecentRequestBadges({
    id: "req-3",
    time: "2026-03-21T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    model: "gpt-4.1-mini",
    routingMiddlewareId: "router-a",
    routingMiddlewareProfile: "small",
    backendName: "Primary",
    outcome: "success",
    latencyMs: 320,
    queuedMs: 18,
    statusCode: 200,
    finishReason: "stop",
    hasDetail: true,
  });

  assert.deepEqual(badges.map((badge) => badge.text), [
    "ok",
    formatDate("2026-03-21T12:00:00.000Z"),
    "latency 320ms",
    "queued 18ms",
    "backend Primary",
    "model gpt-4.1-mini",
    "middleware router-a",
    "outcome small",
    "HTTP 200",
    "finish stop",
    "details",
  ]);
});

test("buildRequestRoutingBadges returns selected middleware and profile badges", () => {
  assert.deepEqual(buildRequestRoutingBadges({
    id: "req-4",
    time: "2026-03-21T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    routingMiddlewareId: "router-a",
    routingMiddlewareProfile: "large",
    outcome: "success",
    latencyMs: 250,
    queuedMs: 12,
  }).map((badge) => badge.text), [
    "middleware router-a",
    "outcome large",
  ]);
});
