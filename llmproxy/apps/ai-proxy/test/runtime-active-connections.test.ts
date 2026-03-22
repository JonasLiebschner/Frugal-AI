import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStreamingUpdateToConnection,
  buildActiveRequestDetail,
  buildCompletedResponseConnectionPatch,
  buildReleaseMetricsForConnection,
  createActiveConnection,
  patchActiveConnection,
} from "../server/ai-proxy-live-requests";
import { StreamingAccumulator } from "../server/ai-proxy-routing";
import type { ProxySnapshot } from "../../shared/type-api";

const backendSnapshots: ProxySnapshot["backends"] = [
  {
    id: "primary",
    name: "Primary",
    baseUrl: "http://127.0.0.1:11434",
    connector: "openai",
    enabled: true,
    healthy: true,
    maxConcurrency: 2,
    activeRequests: 0,
    availableSlots: 2,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    cancelledRequests: 0,
    configuredModels: ["gpt-local"],
    discoveredModels: ["gpt-local"],
    discoveredModelDetails: [
      {
        id: "gpt-local",
        metadata: {
          max_completion_tokens: 80,
        },
      },
    ],
  },
];

test("createActiveConnection clones retained request bodies and reads requested limits", () => {
  const requestBody = {
    model: "gpt-local",
    max_completion_tokens: 120,
    messages: [{ role: "user", content: "hello" }],
  };
  const connection = createActiveConnection(
    {
      id: "req-1",
      receivedAt: 1000,
      method: "POST",
      path: "/v1/chat/completions",
      model: "gpt-local",
      routingMiddlewareId: "router-a",
      routingMiddlewareProfile: "small",
      stream: true,
      requestBody,
    },
    "chat.completions",
    true,
  );

  requestBody.messages[0]!.content = "changed later";

  assert.equal(connection.requestedCompletionTokenLimit, 120);
  assert.equal(connection.routingMiddlewareId, "router-a");
  assert.equal(connection.routingMiddlewareProfile, "small");
  assert.deepEqual(connection.requestBody, {
    model: "gpt-local",
    max_completion_tokens: 120,
    messages: [{ role: "user", content: "hello" }],
  });
});

test("applyStreamingUpdateToConnection promotes live requests to streaming and keeps metrics", () => {
  const connection = createActiveConnection(
    {
      id: "req-2",
      receivedAt: 1000,
      method: "POST",
      path: "/v1/chat/completions",
      stream: true,
    },
    "chat.completions",
    true,
  );

  applyStreamingUpdateToConnection(
    connection,
    {
      addedCompletionTokens: 4,
      addedContentTokens: 4,
      addedReasoningTokens: 0,
      addedTextTokens: 4,
      finishReason: "stop",
      metrics: {
        promptTokens: 10,
        completionTokens: 4,
        totalTokens: 14,
        contentTokens: 4,
        reasoningTokens: 0,
        textTokens: 4,
        exact: true,
      },
    },
    {
      id: "resp-1",
      choices: [],
    },
    1400,
  );

  assert.equal(connection.phase, "streaming");
  assert.equal(connection.firstTokenAt, 1400);
  assert.equal(connection.completionTokens, 4);
  assert.equal(connection.finishReason, "stop");
  assert.deepEqual(connection.responseBody, {
    id: "resp-1",
    choices: [],
  });
});

test("live detail and release metrics use runtime cancellation and effective token limits", () => {
  const connection = createActiveConnection(
    {
      id: "req-3",
      receivedAt: 1000,
      method: "POST",
      path: "/v1/chat/completions",
      model: "gpt-local",
      stream: false,
      requestBody: {
        max_completion_tokens: 120,
      },
    },
    "chat.completions",
    false,
  );
  const accumulator = new StreamingAccumulator("chat.completions", { preserveFullPayload: true });
  accumulator.applyPayload({
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "gpt-local",
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          content: "partial answer",
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  });

  Object.assign(connection, {
    phase: "streaming",
    backendId: "primary",
    backendName: "Primary",
    routingMiddlewareId: "router-b",
    routingMiddlewareProfile: "large",
    statusCode: 200,
    cancelSource: "dashboard",
    completionTokens: 5,
    promptTokens: 10,
    totalTokens: 15,
    contentTokens: 5,
    reasoningTokens: 0,
    textTokens: 5,
    finishReason: "stop",
    metricsExact: true,
    firstTokenAt: 1200,
    streamingAccumulator: accumulator,
  });

  const detail = buildActiveRequestDetail(connection, backendSnapshots, 1600);
  const release = buildReleaseMetricsForConnection(connection, backendSnapshots, 1600);

  assert.equal(detail.entry.outcome, "cancelled");
  assert.equal(detail.entry.routingMiddlewareId, "router-b");
  assert.equal(detail.entry.routingMiddlewareProfile, "large");
  assert.equal(detail.entry.effectiveCompletionTokenLimit, 80);
  assert.equal(detail.entry.timeToFirstTokenMs, 200);
  assert.deepEqual(release.responseBody, accumulator.buildResponse());
  assert.equal(release.effectiveCompletionTokenLimit, 80);
  assert.equal(release.timeToFirstTokenMs, 200);
});

test("completed JSON responses populate release metrics for middleware-routed requests", () => {
  const connection = createActiveConnection(
    {
      id: "req-4",
      receivedAt: 1000,
      method: "POST",
      path: "/v1/chat/completions",
      model: "chat-routed-model",
      routingMiddlewareId: "router-c",
      routingMiddlewareProfile: "large",
      stream: false,
      requestBody: {
        model: "middleware:router-c",
        messages: [
          {
            role: "user",
            content: "Pick the best model.",
          },
        ],
      },
    },
    "chat.completions",
    false,
  );

  patchActiveConnection(connection, {
    phase: "connected",
    backendId: "primary",
    backendName: "Primary",
    statusCode: 200,
    ...buildCompletedResponseConnectionPatch({
      id: "chatcmpl-final",
      model: "chat-routed-model",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "Done.",
          },
        },
      ],
      usage: {
        prompt_tokens: 26,
        completion_tokens: 36,
        total_tokens: 62,
      },
      timings: {
        prompt_ms: 12,
        predicted_ms: 34,
        prompt_per_second: 2166.67,
        predicted_per_second: 1058.82,
      },
    }),
  }, 1600);

  const detail = buildActiveRequestDetail(connection, backendSnapshots, 1600);
  const release = buildReleaseMetricsForConnection(connection, backendSnapshots, 1600);

  assert.equal(detail.entry.routingMiddlewareId, "router-c");
  assert.equal(detail.entry.routingMiddlewareProfile, "large");
  assert.equal(detail.entry.promptTokens, 26);
  assert.equal(detail.entry.completionTokens, 36);
  assert.equal(detail.entry.totalTokens, 62);
  assert.equal(detail.entry.finishReason, "stop");
  assert.equal(detail.entry.metricsExact, true);
  assert.deepEqual(detail.responseBody, {
    id: "chatcmpl-final",
    model: "chat-routed-model",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "Done.",
        },
      },
    ],
    usage: {
      prompt_tokens: 26,
      completion_tokens: 36,
      total_tokens: 62,
    },
    timings: {
      prompt_ms: 12,
      predicted_ms: 34,
      prompt_per_second: 2166.67,
      predicted_per_second: 1058.82,
    },
  });
  assert.equal(release.promptTokens, 26);
  assert.equal(release.completionTokens, 36);
  assert.equal(release.totalTokens, 62);
  assert.equal(release.promptMs, 12);
  assert.equal(release.generationMs, 34);
  assert.equal(release.promptTokensPerSecond, 2166.67);
  assert.equal(release.completionTokensPerSecond, 1058.82);
  assert.equal(release.finishReason, "stop");
  assert.equal(release.metricsExact, true);
});
