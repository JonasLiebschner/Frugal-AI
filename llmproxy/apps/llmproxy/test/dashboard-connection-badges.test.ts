import assert from "node:assert/strict";
import test from "node:test";
import type { ActiveConnectionSnapshot } from "../app/types/dashboard";
import {
  buildConnectionCardBadges,
  buildConnectionMetricBadges,
  buildConnectionTransportBadges,
} from "../app/utils/dashboard-connection-badges";

function createConnection(overrides: Partial<ActiveConnectionSnapshot> = {}): ActiveConnectionSnapshot {
  return {
    id: "req_123",
    kind: "chat.completions",
    method: "POST",
    path: "/v1/chat/completions",
    clientStream: true,
    upstreamStream: true,
    phase: "streaming",
    startedAt: "2026-03-21T10:00:00.000Z",
    elapsedMs: 1400,
    queueMs: 200,
    backendId: "backend_a",
    backendName: "Backend A",
    model: "gpt-small",
    statusCode: 200,
    completionTokens: 42,
    contentTokens: 42,
    reasoningTokens: 0,
    textTokens: 0,
    generationMs: 1000,
    completionTokensPerSecond: 42,
    effectiveCompletionTokenLimit: 256,
    timeToFirstTokenMs: 180,
    metricsExact: true,
    ...overrides,
  };
}

test("buildConnectionTransportBadges renders downstream and upstream transport state", () => {
  const badges = buildConnectionTransportBadges(createConnection());

  assert.equal(badges.length, 2);
  assert.equal(badges[0]?.tone, "good");
  assert.equal(badges[1]?.tone, "good");
  assert.match(badges[0]?.text ?? "", /stream/);
  assert.match(badges[0]?.text ?? "", /42 \/ 256 tok/);
  assert.match(badges[1]?.title ?? "", /HTTP 200/);
});

test("buildConnectionTransportBadges reflects queued requests and inverted arrows", () => {
  const badges = buildConnectionTransportBadges(createConnection({
    phase: "queued",
    backendId: undefined,
    backendName: undefined,
    statusCode: undefined,
    upstreamStream: false,
    queueMs: 0,
    completionTokens: undefined,
    completionTokensPerSecond: undefined,
    effectiveCompletionTokenLimit: undefined,
  }), { invertDirections: true });

  assert.match(badges[0]?.text ?? "", /\u2193 stream/);
  assert.match(badges[1]?.text ?? "", /\u2191 json/);
  assert.match(badges[0]?.title ?? "", /\u221E/);
  assert.equal(badges[0]?.tone, "warn");
  assert.equal(badges[1]?.tone, "neutral");
});

test("buildConnectionCardBadges exposes finish reasons and metric badges stay empty", () => {
  const cardBadges = buildConnectionCardBadges(createConnection({ finishReason: "length" }));

  assert.deepEqual(cardBadges, [
    {
      text: "finish length",
      tone: "good",
      title: 'Final finish reason reported by the backend. "length" usually means generation stopped because the token limit was reached.',
    },
  ]);
  assert.deepEqual(buildConnectionMetricBadges(createConnection()), []);
});
