import assert from "node:assert/strict";
import test from "node:test";

import {
  REQUEST_DETAIL_CACHE_LIMIT,
  isActiveRequestId,
  resolveCachedRequestDetail,
  storeRequestDetailInCache,
} from "../app/utils/request-detail-runtime";
import type { RequestLogDetail } from "../app/types/dashboard";

function createDetail(id: string): RequestLogDetail {
  return {
    entry: {
      id,
      time: "2026-03-21T12:00:00.000Z",
      method: "POST",
      path: "/v1/chat/completions",
      outcome: "success",
      latencyMs: 1,
      queuedMs: 0,
    },
  };
}

test("storeRequestDetailInCache evicts the oldest entries once the limit is exceeded", () => {
  const cache: Record<string, RequestLogDetail> = {};

  for (let index = 0; index <= REQUEST_DETAIL_CACHE_LIMIT; index += 1) {
    storeRequestDetailInCache(cache, createDetail(`req-${index}`));
  }

  assert.equal(Object.keys(cache).length, REQUEST_DETAIL_CACHE_LIMIT);
  assert.equal(cache["req-0"], undefined);
  assert.ok(cache[`req-${REQUEST_DETAIL_CACHE_LIMIT}`]);
});

test("resolveCachedRequestDetail ignores cache for active requests and disabled lookups", () => {
  const cache = {
    "req-1": createDetail("req-1"),
  };
  const activeConnections = [{
    id: "req-1",
    kind: "chat",
    method: "POST",
    path: "/v1/chat/completions",
    clientStream: false,
    upstreamStream: false,
    phase: "connected" as const,
    startedAt: "2026-03-21T12:00:00.000Z",
    elapsedMs: 0,
    queueMs: 0,
    contentTokens: 0,
    reasoningTokens: 0,
    textTokens: 0,
    metricsExact: false,
  }];

  assert.equal(isActiveRequestId(activeConnections, "req-1"), true);
  assert.equal(resolveCachedRequestDetail(activeConnections, cache, "req-1", true), null);
  assert.equal(resolveCachedRequestDetail([], cache, "req-1", false), null);
  assert.equal(resolveCachedRequestDetail([], cache, "req-1", true)?.entry.id, "req-1");
});
