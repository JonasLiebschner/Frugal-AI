import assert from "node:assert/strict";
import test from "node:test";
import { buildProxySnapshotDelta } from "../server/ai-proxy-routing";
import type { ProxySnapshot } from "../../shared/type-api";

function createSnapshot(): ProxySnapshot {
  return {
    startedAt: "2026-03-16T10:00:00.000Z",
    queueDepth: 0,
    recentRequestLimit: 3,
    totals: {
      activeRequests: 1,
      successfulRequests: 4,
      failedRequests: 1,
      cancelledRequests: 0,
      rejectedRequests: 0,
    },
    backends: [
      {
        id: "backend-a",
        name: "Backend A",
        baseUrl: "http://backend-a.local",
        connector: "openai",
        enabled: true,
        healthy: true,
        maxConcurrency: 4,
        activeRequests: 1,
        availableSlots: 3,
        totalRequests: 5,
        successfulRequests: 4,
        failedRequests: 1,
        cancelledRequests: 0,
        configuredModels: ["model-a"],
        discoveredModels: [],
        discoveredModelDetails: [],
      },
    ],
    activeConnections: [
      {
        id: "conn-a",
        kind: "chat.completions",
        method: "POST",
        path: "/v1/chat/completions",
        clientStream: true,
        upstreamStream: true,
        phase: "streaming",
        startedAt: "2026-03-16T10:00:01.000Z",
        elapsedMs: 1200,
        queueMs: 0,
        contentTokens: 12,
        reasoningTokens: 0,
        textTokens: 0,
        metricsExact: true,
      },
    ],
    recentRequests: [
      {
        id: "req-a",
        time: "2026-03-16T10:00:00.500Z",
        method: "POST",
        path: "/v1/chat/completions",
        outcome: "success",
        latencyMs: 240,
        queuedMs: 0,
      },
      {
        id: "req-b",
        time: "2026-03-16T09:59:58.000Z",
        method: "POST",
        path: "/v1/chat/completions",
        outcome: "error",
        latencyMs: 180,
        queuedMs: 0,
      },
    ],
  };
}

test("buildProxySnapshotDelta only emits changed snapshot fields and entity updates", () => {
  const previous = createSnapshot();
  const current: ProxySnapshot = {
    ...previous,
    queueDepth: 2,
    totals: {
      ...previous.totals,
      activeRequests: 2,
      successfulRequests: 5,
    },
    backends: [
      {
        ...previous.backends[0]!,
        activeRequests: 2,
        availableSlots: 2,
        totalRequests: 6,
        successfulRequests: 5,
      },
    ],
    activeConnections: [
      {
        ...previous.activeConnections[0]!,
        elapsedMs: 2200,
        contentTokens: 20,
      },
      {
        id: "conn-b",
        kind: "chat.completions",
        method: "POST",
        path: "/v1/chat/completions",
        clientStream: false,
        upstreamStream: true,
        phase: "queued",
        startedAt: "2026-03-16T10:00:02.000Z",
        elapsedMs: 50,
        queueMs: 50,
        contentTokens: 0,
        reasoningTokens: 0,
        textTokens: 0,
        metricsExact: false,
      },
    ],
    recentRequests: [
      {
        id: "req-c",
        time: "2026-03-16T10:00:02.500Z",
        method: "POST",
        path: "/v1/chat/completions",
        outcome: "success",
        latencyMs: 90,
        queuedMs: 0,
      },
      previous.recentRequests[0]!,
    ],
  };

  const delta = buildProxySnapshotDelta(previous, current);

  assert.deepEqual(delta, {
    queueDepth: 2,
    totals: {
      activeRequests: 2,
      successfulRequests: 5,
      failedRequests: 1,
      cancelledRequests: 0,
      rejectedRequests: 0,
    },
    backends: {
      upserted: [current.backends[0]],
    },
    activeConnections: {
      upserted: current.activeConnections,
      orderedIds: ["conn-a", "conn-b"],
    },
    recentRequests: {
      upserted: [current.recentRequests[0]],
      removedIds: ["req-b"],
      orderedIds: ["req-c", "req-a"],
    },
  });
});

test("buildProxySnapshotDelta returns undefined when nothing changed", () => {
  const snapshot = createSnapshot();
  assert.equal(buildProxySnapshotDelta(snapshot, snapshot), undefined);
});
