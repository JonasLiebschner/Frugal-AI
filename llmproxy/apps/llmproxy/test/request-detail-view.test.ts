import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRequestDetailSubtitle,
  buildRequestDetailTitle,
  resolveRequestLiveConnection,
} from "../app/utils/request-detail-view";
import type { ActiveConnectionSnapshot, RequestLogDetail } from "../app/types/dashboard";

const detail: RequestLogDetail = {
  entry: {
    id: "req-1",
    time: "2026-03-21T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    clientIp: "127.0.0.1",
    model: "gpt-4.1-mini",
    backendName: "Backend A",
    outcome: "success",
    latencyMs: 12,
    queuedMs: 3,
  },
  live: false,
};

test("request detail view helpers format title and subtitle from request detail", () => {
  assert.equal(buildRequestDetailTitle(detail), "POST /v1/chat/completions");
  assert.match(buildRequestDetailSubtitle(detail), /IP 127\.0\.0\.1/);
  assert.match(buildRequestDetailSubtitle(detail), /req req-1/);
  assert.match(buildRequestDetailSubtitle(detail), /model gpt-4\.1-mini/);
  assert.match(buildRequestDetailSubtitle(detail), /backend Backend A/);
});

test("resolveRequestLiveConnection only returns live matching connections", () => {
  const activeConnections: ActiveConnectionSnapshot[] = [{
    id: "req-1",
    kind: "chat",
    method: "POST",
    path: "/v1/chat/completions",
    clientStream: false,
    upstreamStream: false,
    phase: "connected",
    startedAt: "2026-03-21T12:00:00.000Z",
    elapsedMs: 5,
    queueMs: 0,
    contentTokens: 0,
    reasoningTokens: 0,
    textTokens: 0,
    metricsExact: false,
  }];

  assert.equal(resolveRequestLiveConnection(activeConnections, "req-1", true)?.id, "req-1");
  assert.equal(resolveRequestLiveConnection(activeConnections, "req-1", false), null);
  assert.equal(resolveRequestLiveConnection(activeConnections, "", true), null);
});
