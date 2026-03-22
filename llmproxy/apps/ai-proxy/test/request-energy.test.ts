import assert from "node:assert/strict";
import test from "node:test";

import { waitFor } from "../../ai-client/test/test-helpers";
import type { AiClientLoadBalancer } from "../../ai-client/server/ai-client-capability";
import { LiveRequestState } from "../server/ai-proxy-live-request-state";
import type { ProxySnapshot } from "../../shared/type-api";

const sampleEnergyPayload = {
  total_power_w: 392.52,
  per_gpu: {
    0: {
      name: "NVIDIA H200 NVL",
      power_w: 97.88,
      power_limit_w: 600.0,
      temp_c: 41,
      util_gpu_pct: 0,
      util_mem_pct: 0,
      mem_used_mib: 5865.6,
      mem_total_mib: 143771.0,
      mem_free_mib: 137905.4,
    },
    1: {
      name: "NVIDIA H200 NVL",
      power_w: 99.18,
      power_limit_w: 600.0,
      temp_c: 41,
      util_gpu_pct: 0,
      util_mem_pct: 0,
      mem_used_mib: 1131.6,
      mem_total_mib: 143771.0,
      mem_free_mib: 142639.4,
    },
    2: {
      name: "NVIDIA H200 NVL",
      power_w: 99.2,
      power_limit_w: 600.0,
      temp_c: 40,
      util_gpu_pct: 0,
      util_mem_pct: 0,
      mem_used_mib: 1131.6,
      mem_total_mib: 143771.0,
      mem_free_mib: 142639.4,
    },
    3: {
      name: "NVIDIA H200 NVL",
      power_w: 96.26,
      power_limit_w: 600.0,
      temp_c: 40,
      util_gpu_pct: 0,
      util_mem_pct: 0,
      mem_used_mib: 1131.6,
      mem_total_mib: 143771.0,
      mem_free_mib: 142639.4,
    },
  },
  ts: 1774107905.6699667,
};

function createSnapshot(): ProxySnapshot {
  return {
    startedAt: "2026-03-21T00:00:00.000Z",
    queueDepth: 0,
    recentRequestLimit: 1000,
    totals: {
      activeRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cancelledRequests: 0,
      rejectedRequests: 0,
    },
    backends: [],
    activeConnections: [],
    recentRequests: [],
  };
}

function createLoadBalancer(snapshot: ProxySnapshot): AiClientLoadBalancer {
  return {
    acquire: async () => {
      throw new Error("not implemented");
    },
    getAiClientSettings: () => ({
      requestTimeoutMs: 60_000,
      queueTimeoutMs: 30_000,
      healthCheckIntervalMs: 10_000,
      recentRequestLimit: snapshot.recentRequestLimit,
    }),
    getSnapshot: () => snapshot,
    getRequestLogDetail: () => undefined,
    listKnownModels: () => [],
    mergeRequestOtelDebug: () => undefined,
    replaceConfig: () => undefined,
    on: () => undefined,
    off: () => undefined,
    stop: async () => undefined,
  };
}

function createNoopSse() {
  return {
    isEnabled: () => true,
    broadcastHeartbeat: () => undefined,
    getTopicClientCount: () => 0,
    getBufferedBytes: () => 0,
    hasSubscribers: () => false,
    openTopicStream: async () => undefined,
    closeAll: async () => undefined,
    broadcastTopic: () => undefined,
    closeTopicSubscribers: () => undefined,
  };
}

test("LiveRequestState captures per-request energy usage from backend power samples", async () => {
  const snapshot = createSnapshot();
  const requestState = new LiveRequestState(createLoadBalancer(snapshot), {
    sse: createNoopSse(),
    energy: {
      pollIntervalMs: 10,
      fetcher: async () => new Response(JSON.stringify({ total_power_w: 360 }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    },
  });

  requestState.trackConnection({
    id: "req-energy-1",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "gpt-4.1-mini",
    stream: false,
  }, "chat.completions", false);
  requestState.updateConnection("req-energy-1", {
    backendId: "backend-energy",
    backendName: "Energy backend",
  });
  requestState.startConnectionEnergyTracking("req-energy-1", {
    id: "backend-energy",
    energyUsageUrl: "http://127.0.0.1:9100/energy",
    monitoringTimeoutMs: 100,
  });

  const observed = await waitFor(() => {
    const connection = requestState.getActiveConnection("req-energy-1");
    return typeof connection?.energyUsageWh === "number" && connection.energyUsageWh > 0;
  }, {
    timeoutMs: 250,
    intervalMs: 10,
  });

  assert.equal(observed, true);

  const releaseMetrics = requestState.buildReleaseMetrics("req-energy-1");
  assert.equal(typeof releaseMetrics.energyUsageWh, "number");
  assert.ok((releaseMetrics.energyUsageWh ?? 0) > 0);

  requestState.removeConnection("req-energy-1");
  await requestState.stop();
});

test("LiveRequestState accepts energy payloads with per_gpu details and timestamps", async () => {
  const snapshot = createSnapshot();
  const requestState = new LiveRequestState(createLoadBalancer(snapshot), {
    sse: createNoopSse(),
    energy: {
      pollIntervalMs: 10,
      fetcher: async () => new Response(JSON.stringify(sampleEnergyPayload), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    },
  });

  requestState.trackConnection({
    id: "req-energy-payload",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "gpt-4.1-mini",
    stream: false,
  }, "chat.completions", false);
  requestState.updateConnection("req-energy-payload", {
    backendId: "backend-energy-payload",
    backendName: "Energy payload backend",
  });
  requestState.startConnectionEnergyTracking("req-energy-payload", {
    id: "backend-energy-payload",
    energyUsageUrl: "http://127.0.0.1:9100/energy",
    monitoringTimeoutMs: 100,
  });

  const observed = await waitFor(() => {
    const connection = requestState.getActiveConnection("req-energy-payload");
    return typeof connection?.energyUsageWh === "number" && connection.energyUsageWh > 0;
  }, {
    timeoutMs: 250,
    intervalMs: 10,
  });

  assert.equal(observed, true);

  const releaseMetrics = requestState.buildReleaseMetrics("req-energy-payload");
  assert.equal(typeof releaseMetrics.energyUsageWh, "number");
  assert.ok((releaseMetrics.energyUsageWh ?? 0) > 0);

  requestState.removeConnection("req-energy-payload");
  await requestState.stop();
});
