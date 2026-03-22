import test from "node:test";
import assert from "node:assert/strict";
import { LoadBalancer } from "../server/ai-client-capability";
import { createAiRequestMiddlewareRegistry } from "../../ai-request-middleware/server/ai-request-middleware-capability";
import type { AiClientConfig, AiClientSettings, RequestLogDetail } from "../../shared/type-api";
import { delay, waitFor } from "./test-helpers";

const TEST_AI_CLIENT_SETTINGS: AiClientSettings = {
  requestTimeoutMs: 5_000,
  queueTimeoutMs: 500,
  healthCheckIntervalMs: 10_000,
  recentRequestLimit: 1000,
};

const TEST_CONFIG: AiClientConfig = {
  ...TEST_AI_CLIENT_SETTINGS,
  connections: [
    {
      id: "llama-a",
      name: "llama A",
      baseUrl: "http://127.0.0.1:8080",
      enabled: true,
      maxConcurrency: 1,
      models: ["chat-*"],
    },
    {
      id: "llama-b",
      name: "llama B",
      baseUrl: "http://127.0.0.1:8081",
      enabled: true,
      maxConcurrency: 1,
      models: ["embed-*"],
    },
  ],
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

test("routes by model and queues when the slot is full", async () => {
  const balancer = new LoadBalancer(TEST_CONFIG, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
  });
  const firstLease = await balancer.acquire({
    id: "req-1",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "chat-local",
    stream: true,
  });

  assert.equal(firstLease.backend.id, "llama-a");

  let secondResolved = false;
  const secondLeasePromise = balancer
    .acquire({
      id: "req-2",
      receivedAt: Date.now(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "chat-local",
      stream: true,
    })
    .then((lease) => {
      secondResolved = true;
      return lease;
    });

  await delay(50);
  assert.equal(secondResolved, false);

  firstLease.release({
    outcome: "success",
    latencyMs: 120,
    statusCode: 200,
    queuedMs: firstLease.queueMs,
  });

  const secondLease = await secondLeasePromise;
  assert.equal(secondLease.backend.id, "llama-a");

  secondLease.release({
    outcome: "success",
    latencyMs: 90,
    statusCode: 200,
    queuedMs: secondLease.queueMs,
  });

  const embedLease = await balancer.acquire({
    id: "req-3",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/embeddings",
    model: "embed-local",
    stream: false,
  });

  assert.equal(embedLease.backend.id, "llama-b");
  embedLease.release({
    outcome: "success",
    latencyMs: 80,
    statusCode: 200,
    queuedMs: embedLease.queueMs,
  });

  const snapshot = balancer.getSnapshot();
  assert.equal(snapshot.queueDepth, 0);
  assert.equal(snapshot.backends[0]?.successfulRequests, 2);
  assert.equal(snapshot.backends[1]?.successfulRequests, 1);
});

test("uses discovered models as the routing source of truth even with wildcard configuration", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    connections: [
      {
        id: "wildcard-a",
        name: "Wildcard A",
        baseUrl: "http://127.0.0.1:9100",
        enabled: true,
        maxConcurrency: 1,
        models: ["*"],
      },
      {
        id: "wildcard-b",
        name: "Wildcard B",
        baseUrl: "http://127.0.0.1:9101",
        enabled: true,
        maxConcurrency: 1,
        models: ["*"],
      },
    ],
  };

  const balancer = new LoadBalancer(config, {
    fetcher: async (input) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      );

      if (url.port === "9100") {
        return jsonResponse({ object: "list", data: [{ id: "model-a" }] });
      }

      return jsonResponse({ object: "list", data: [{ id: "model-b" }] });
    },
  });

  await balancer.start();

  const lease = await balancer.acquire({
    id: "req-discovered-match",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "model-b",
    stream: true,
  });

  assert.equal(lease.backend.id, "wildcard-b");

  lease.release({
    outcome: "success",
    latencyMs: 40,
    statusCode: 200,
    queuedMs: lease.queueMs,
  });

  await assert.rejects(
    () => balancer.acquire({
      id: "req-discovered-miss",
      receivedAt: Date.now(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "model-c",
      stream: true,
    }),
    /No backend configured for model "model-c"\./,
  );

  await balancer.stop();
});

test("routes requests using discovered model aliases", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    connections: [
      {
        id: "alias-backend",
        name: "Alias Backend",
        baseUrl: "http://127.0.0.1:9200",
        enabled: true,
        maxConcurrency: 1,
        models: ["*"],
      },
    ],
  };

  const balancer = new LoadBalancer(config, {
    fetcher: async () => jsonResponse({
      object: "list",
      data: [
        {
          id: "canonical-model",
          aliases: ["friendly-model"],
        },
      ],
    }),
  });

  await balancer.start();

  const lease = await balancer.acquire({
    id: "req-alias",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "friendly-model",
    stream: true,
  });

  assert.equal(lease.backend.id, "alias-backend");
  assert.equal(lease.selectedModel, "canonical-model");

  lease.release({
    outcome: "success",
    latencyMs: 35,
    statusCode: 200,
    queuedMs: lease.queueMs,
  });

  await balancer.stop();
});

test("request middleware can override the routed model when selected through the model prefix", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    connections: [
      {
        id: "router-a",
        name: "Router A",
        baseUrl: "http://127.0.0.1:9210",
        enabled: true,
        maxConcurrency: 1,
        models: ["fast-model"],
      },
      {
        id: "router-b",
        name: "Router B",
        baseUrl: "http://127.0.0.1:9211",
        enabled: true,
        maxConcurrency: 1,
        models: ["smart-model"],
      },
    ],
  };
  const middleware = createAiRequestMiddlewareRegistry();
  middleware.registerRoutingMiddleware({
    id: "external-model-router",
    route: async ({ prompt, knownModels }) => {
      assert.equal(prompt?.lastUserText, "Need the smartest answer.");
      return {
        model: knownModels.find((model) => model.id === "smart-model")?.id,
        metadata: {
          model: "smart-model",
          classification: "large",
        },
      };
    },
  });

  const balancer = new LoadBalancer(config, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
    requestMiddleware: middleware,
  });

  const lease = await balancer.acquire({
    id: "req-middleware-route",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    requestedModel: "middleware:external-model-router",
    model: "middleware:external-model-router",
    stream: false,
    requestBody: {
      model: "middleware:external-model-router",
      messages: [
        {
          role: "user",
          content: "Need the smartest answer.",
        },
      ],
    },
  });

  assert.equal(lease.backend.id, "router-b");
  assert.equal(lease.selectedModel, "smart-model");

  lease.release({
    outcome: "success",
    latencyMs: 20,
    statusCode: 200,
    queuedMs: lease.queueMs,
  });

  const recentEntry = balancer.getSnapshot().recentRequests[0];
  assert.equal(recentEntry?.routingMiddlewareId, "external-model-router");
  assert.equal(recentEntry?.routingMiddlewareProfile, "smart-model");
});

test("request middleware direct models must still be routable immediately", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    connections: [
      {
        id: "router-a",
        name: "Router A",
        baseUrl: "http://127.0.0.1:9212",
        enabled: true,
        maxConcurrency: 1,
        models: ["fast-model"],
      },
    ],
  };
  const middleware = createAiRequestMiddlewareRegistry();
  middleware.registerRoutingMiddleware({
    id: "external-model-router",
    route: async () => ({
      model: "smart-model",
    }),
  });

  const balancer = new LoadBalancer(config, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
    requestMiddleware: middleware,
  });

  await assert.rejects(
    async () => await balancer.acquire({
      id: "req-middleware-unroutable-model",
      receivedAt: Date.now(),
      method: "POST",
      path: "/v1/chat/completions",
      requestedModel: "middleware:external-model-router",
      model: "middleware:external-model-router",
      stream: false,
      requestBody: {
        model: "middleware:external-model-router",
        messages: [
          {
            role: "user",
            content: "Need the smartest answer.",
          },
        ],
      },
    }),
    /resolved unroutable model "smart-model": No backend configured for model "smart-model"\./u,
  );
});

test("request middlewares stay inactive unless the model explicitly selects one", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    connections: [
      {
        id: "router-a",
        name: "Router A",
        baseUrl: "http://127.0.0.1:9220",
        enabled: true,
        maxConcurrency: 1,
        models: ["fast-model"],
      },
      {
        id: "router-b",
        name: "Router B",
        baseUrl: "http://127.0.0.1:9221",
        enabled: true,
        maxConcurrency: 1,
        models: ["smart-model"],
      },
    ],
  };
  let middlewareCalls = 0;
  const middleware = createAiRequestMiddlewareRegistry();
  middleware.registerRoutingMiddleware({
    id: "external-model-router",
    route: async () => {
      middlewareCalls += 1;
      return {
        model: "smart-model",
      };
    },
  });

  const balancer = new LoadBalancer(config, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
    requestMiddleware: middleware,
  });

  const lease = await balancer.acquire({
    id: "req-no-middleware-route",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    requestedModel: "fast-model",
    model: "fast-model",
    stream: false,
    requestBody: {
      model: "fast-model",
      messages: [
        {
          role: "user",
          content: "Keep the directly requested model.",
        },
      ],
    },
  });

  assert.equal(middlewareCalls, 0);
  assert.equal(lease.backend.id, "router-a");
  assert.equal(lease.selectedModel, "fast-model");

  lease.release({
    outcome: "success",
    latencyMs: 20,
    statusCode: 200,
    queuedMs: lease.queueMs,
  });
});

test("request middleware selectors require a middleware id suffix", async () => {
  const middleware = createAiRequestMiddlewareRegistry();
  const balancer = new LoadBalancer(TEST_CONFIG, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
    requestMiddleware: middleware,
  });

  await assert.rejects(
    async () => await balancer.acquire({
      id: "req-invalid-middleware-selector",
      receivedAt: Date.now(),
      method: "POST",
      path: "/v1/chat/completions",
      requestedModel: "middleware:",
      model: "middleware:",
      stream: false,
      requestBody: {
        model: "middleware:",
      },
    }),
    /Invalid middleware model selector/u,
  );
});

test("request middleware selectors fail when the selected middleware is not registered", async () => {
  const middleware = createAiRequestMiddlewareRegistry();
  const balancer = new LoadBalancer(TEST_CONFIG, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
    requestMiddleware: middleware,
  });

  await assert.rejects(
    async () => await balancer.acquire({
      id: "req-missing-middleware-selector",
      receivedAt: Date.now(),
      method: "POST",
      path: "/v1/chat/completions",
      requestedModel: "middleware:missing-router",
      model: "middleware:missing-router",
      stream: false,
      requestBody: {
        model: "middleware:missing-router",
      },
    }),
    /Request middleware "missing-router" is not registered\./u,
  );
});

test("auto randomly selects from available backend/model candidates", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    connections: [
      {
        id: "auto-a",
        name: "Auto A",
        baseUrl: "http://127.0.0.1:9300",
        enabled: true,
        maxConcurrency: 1,
        models: ["*"],
      },
      {
        id: "auto-b",
        name: "Auto B",
        baseUrl: "http://127.0.0.1:9301",
        enabled: true,
        maxConcurrency: 1,
        models: ["*"],
      },
    ],
  };

  const balancer = new LoadBalancer(config, {
    fetcher: async (input) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      );

      if (url.port === "9300") {
        return jsonResponse({ object: "list", data: [{ id: "auto-model-a" }] });
      }

      return jsonResponse({ object: "list", data: [{ id: "auto-model-b" }] });
    },
    random: () => 0.99,
  });

  await balancer.start();

  const firstLease = await balancer.acquire({
    id: "req-auto-1",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "auto",
    stream: true,
  });

  assert.equal(firstLease.backend.id, "auto-b");
  assert.equal(firstLease.selectedModel, "auto-model-b");

  const secondLease = await balancer.acquire({
    id: "req-auto-2",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "*",
    stream: true,
  });

  assert.equal(secondLease.backend.id, "auto-a");
  assert.equal(secondLease.selectedModel, "auto-model-a");

  firstLease.release({
    outcome: "success",
    latencyMs: 25,
    statusCode: 200,
    queuedMs: firstLease.queueMs,
  });
  secondLease.release({
    outcome: "success",
    latencyMs: 25,
    statusCode: 200,
    queuedMs: secondLease.queueMs,
  });

  const snapshot = balancer.getSnapshot();
  assert.equal(snapshot.recentRequests[0]?.model, "auto-model-a");
  assert.equal(snapshot.recentRequests[1]?.model, "auto-model-b");

  await balancer.stop();
});

test("auto randomly selects among multiple concrete models on one backend", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    connections: [
      {
        id: "auto-multi",
        name: "Auto Multi",
        baseUrl: "http://127.0.0.1:9711",
        enabled: true,
        maxConcurrency: 1,
        models: ["*"],
      },
    ],
  };

  const balancer = new LoadBalancer(config, {
    fetcher: async () => jsonResponse({
      object: "list",
      data: [
        { id: "small-sufficient-model" },
        { id: "large-sufficient-model" },
      ],
    }),
    random: () => 0.99,
  });

  await balancer.start();

  const lease = await balancer.acquire({
    id: "req-auto-multi",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "auto",
    stream: true,
  });

  assert.equal(lease.backend.id, "auto-multi");
  assert.equal(lease.selectedModel, "large-sufficient-model");

  lease.release({
    outcome: "success",
    latencyMs: 25,
    statusCode: 200,
    queuedMs: lease.queueMs,
  });

  await balancer.stop();
});

test("auto skips discovered models that are not allowed by the whitelist", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    connections: [
      {
        id: "auto-whitelist",
        name: "Auto Whitelist",
        baseUrl: "http://127.0.0.1:9700",
        enabled: true,
        maxConcurrency: 1,
        models: ["allowed-*"],
      },
    ],
  };

  const balancer = new LoadBalancer(config, {
    fetcher: async () => jsonResponse({
      object: "list",
      data: [
        { id: "blocked-model" },
        { id: "allowed-model" },
      ],
    }),
  });

  await balancer.start();

  const lease = await balancer.acquire({
    id: "req-auto-whitelist",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "auto",
    stream: true,
  });

  assert.equal(lease.backend.id, "auto-whitelist");
  assert.equal(lease.selectedModel, "allowed-model");

  lease.release({
    outcome: "success",
    latencyMs: 25,
    statusCode: 200,
    queuedMs: lease.queueMs,
  });

  await balancer.stop();
});

test("missing model selects the first free backend with a concrete model", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    connections: [
      {
        id: "missing-a",
        name: "Missing A",
        baseUrl: "http://127.0.0.1:9400",
        enabled: true,
        maxConcurrency: 1,
        models: ["*"],
      },
      {
        id: "missing-b",
        name: "Missing B",
        baseUrl: "http://127.0.0.1:9401",
        enabled: true,
        maxConcurrency: 1,
        models: ["*"],
      },
    ],
  };

  const balancer = new LoadBalancer(config, {
    fetcher: async (input) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      );

      if (url.port === "9400") {
        return jsonResponse({ object: "list", data: [{ id: "missing-model-a" }] });
      }

      return jsonResponse({ object: "list", data: [{ id: "missing-model-b" }] });
    },
  });

  await balancer.start();

  const lease = await balancer.acquire({
    id: "req-missing-model",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    stream: true,
  });

  assert.equal(lease.backend.id, "missing-a");
  assert.equal(lease.selectedModel, "missing-model-a");

  lease.release({
    outcome: "success",
    latencyMs: 20,
    statusCode: 200,
    queuedMs: lease.queueMs,
  });

  await balancer.stop();
});

test("completed requests store heuristic diagnostics when the built-in checks find a likely issue", async () => {
  const balancer = new LoadBalancer(TEST_CONFIG, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
  });

  const lease = await balancer.acquire({
    id: "req-heuristic-warning",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "chat-local",
    stream: true,
    requestBody: {
      model: "chat-local",
      max_completion_tokens: 256,
      messages: [
        {
          role: "user",
          content: "Write a very long answer.",
        },
      ],
    },
  });

  lease.release({
    outcome: "success",
    latencyMs: 140,
    statusCode: 200,
    queuedMs: lease.queueMs,
    completionTokens: 256,
    effectiveCompletionTokenLimit: 256,
    finishReason: "length",
    responseBody: {
      choices: [
        {
          message: {
            role: "assistant",
            content: "The answer was cut off before it finished.",
          },
        },
      ],
    },
  });

  const entry = balancer.getSnapshot().recentRequests[0];
  assert.equal(entry?.diagnosticSeverity, "warn");
  assert.match(entry?.diagnosticTitle ?? "", /token ceiling/i);
  assert.match(entry?.diagnosticSummary ?? "", /completion budget was exhausted|cut off by the token budget/i);
});

test("completed requests emit one final request log line on stdout using metadata only", async () => {
  const requestLogLines: string[] = [];
  const balancer = new LoadBalancer(TEST_CONFIG, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
    requestLogWriter: (line) => {
      requestLogLines.push(line);
    },
  });

  const lease = await balancer.acquire({
    id: "req-stdout-log",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "chat-local",
    stream: true,
    requestBody: {
      model: "chat-local",
      messages: [
        {
          role: "user",
          content: "Say hello once.",
        },
      ],
    },
  });

  lease.release({
    outcome: "success",
    latencyMs: 80,
    statusCode: 200,
    queuedMs: lease.queueMs,
    finishReason: "stop",
    responseBody: {
      choices: [
        {
          message: {
            role: "assistant",
            content: "Hello there.",
          },
        },
      ],
    },
  });

  assert.equal(requestLogLines.length, 1);
  const parsed = JSON.parse(requestLogLines[0] ?? "{}");
  assert.deepEqual(
    parsed,
    JSON.parse(JSON.stringify(balancer.getRequestLogDetail("req-stdout-log")?.entry)),
  );
  assert.equal("requestBody" in parsed, false);
  assert.equal("responseBody" in parsed, false);
  assert.equal(requestLogLines[0]?.includes("Say hello once."), false);
  assert.equal(requestLogLines[0]?.includes("Hello there."), false);
  assert.equal(requestLogLines[0]?.includes("\"messages\""), false);
  assert.equal(requestLogLines[0]?.includes("\"content\""), false);
});

test("rejected requests also emit one final metadata-only request log line", async () => {
  const requestLogLines: string[] = [];
  const balancer = new LoadBalancer({
    ...TEST_CONFIG,
    connections: [],
  }, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
    requestLogWriter: (line) => {
      requestLogLines.push(line);
    },
  });

  await assert.rejects(
    () => balancer.acquire({
      id: "req-stdout-rejected",
      receivedAt: Date.now(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "chat-local",
      stream: true,
      requestBody: {
        model: "chat-local",
      },
    }),
    /No backends configured\./,
  );

  assert.equal(requestLogLines.length, 1);
  const parsed = JSON.parse(requestLogLines[0] ?? "{}");
  assert.deepEqual(
    parsed,
    JSON.parse(JSON.stringify(balancer.getRequestLogDetail("req-stdout-rejected")?.entry)),
  );
  assert.equal("requestBody" in parsed, false);
  assert.equal("responseBody" in parsed, false);
});

test("final request logs can also notify a structured observer", async () => {
  const observed: RequestLogDetail[] = [];
  const balancer = new LoadBalancer(TEST_CONFIG, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
    requestLogObserver: (detail) => {
      observed.push(detail);
    },
  });

  const lease = await balancer.acquire({
    id: "req-observer",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "chat-local",
    stream: false,
    requestBody: {
      model: "chat-local",
      messages: [
        {
          role: "user",
          content: "Respond briefly.",
        },
      ],
    },
  });

  lease.release({
    outcome: "success",
    latencyMs: 45,
    statusCode: 200,
    queuedMs: lease.queueMs,
    finishReason: "stop",
    responseBody: {
      choices: [
        {
          message: {
            role: "assistant",
            content: "Done.",
          },
        },
      ],
    },
  });

  assert.equal(observed.length, 1);
  assert.equal(observed[0]?.entry.id, "req-observer");
  assert.deepEqual(observed[0]?.requestBody, {
    model: "chat-local",
    messages: [
      {
        role: "user",
        content: "Respond briefly.",
      },
    ],
  });
});

test("completed requests without a clear heuristic problem remain unflagged", async () => {
  const balancer = new LoadBalancer(TEST_CONFIG, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
  });

  const lease = await balancer.acquire({
    id: "req-heuristic-clean",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "chat-local",
    stream: true,
    requestBody: {
      model: "chat-local",
      messages: [
        {
          role: "user",
          content: "Say hello once.",
        },
      ],
    },
  });

  lease.release({
    outcome: "success",
    latencyMs: 80,
    statusCode: 200,
    queuedMs: lease.queueMs,
    finishReason: "stop",
    responseBody: {
      choices: [
        {
          message: {
            role: "assistant",
            content: "Hello there.",
          },
        },
      ],
    },
  });

  const entry = balancer.getSnapshot().recentRequests[0];
  assert.equal(entry?.diagnosticSeverity, undefined);
  assert.equal(entry?.diagnosticTitle, undefined);
  assert.equal(entry?.diagnosticSummary, undefined);
});

test("missing models behaves like a wildcard allowlist", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    connections: [
      {
        id: "open-backend",
        name: "Open Backend",
        baseUrl: "http://127.0.0.1:9500",
        enabled: true,
        maxConcurrency: 1,
      },
    ],
  };

  const balancer = new LoadBalancer(config, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
  });

  const lease = await balancer.acquire({
    id: "req-open-model",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "any-model-name",
    stream: true,
  });

  assert.equal(lease.backend.id, "open-backend");
  assert.equal(lease.selectedModel, "any-model-name");

  lease.release({
    outcome: "success",
    latencyMs: 20,
    statusCode: 200,
    queuedMs: lease.queueMs,
  });
});

test("captures discovered model metadata from /v1/models for backend snapshots", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    connections: [
      {
        id: "meta-backend",
        name: "Metadata Backend",
        baseUrl: "http://127.0.0.1:9090",
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
      },
    ],
  };

  const balancer = new LoadBalancer(config, {
    fetcher: async () =>
      jsonResponse({
        object: "list",
        models: [
          {
            name: "meta-model",
            model: "meta-model",
            description: "Metadata-rich test model",
            capabilities: ["completion", "multimodal"],
            details: {
              format: "gguf",
            },
          },
        ],
        data: [
          {
            id: "meta-model",
            object: "model",
            created: 1773335036,
            owned_by: "llamacpp",
            aliases: ["meta-model"],
            meta: {
              n_ctx_train: 262144,
              n_params: 1234567890,
            },
          },
        ],
      }),
  });

  await balancer.start();

  const snapshot = balancer.getSnapshot();
  assert.deepEqual(snapshot.backends[0]?.discoveredModels, ["meta-model"]);
  assert.deepEqual(snapshot.backends[0]?.discoveredModelDetails, [
    {
      id: "meta-model",
      metadata: {
        id: "meta-model",
        object: "model",
        created: 1773335036,
        owned_by: "llamacpp",
        aliases: ["meta-model"],
        meta: {
          n_ctx_train: 262144,
          n_params: 1234567890,
        },
        name: "meta-model",
        model: "meta-model",
        description: "Metadata-rich test model",
        capabilities: ["completion", "multimodal"],
        details: {
          format: "gguf",
        },
      },
    },
  ]);

  await balancer.stop();
});

test("releasing a lease after replaceConfig updates the current backend runtime", async () => {
  const balancer = new LoadBalancer(TEST_CONFIG, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
  });

  const firstLease = await balancer.acquire({
    id: "req-replace-1",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "chat-local",
    stream: true,
  });

  balancer.replaceConfig({
    ...TEST_CONFIG,
    connections: TEST_CONFIG.connections.map((connection) => ({
      ...connection,
    })),
  });

  let secondResolved = false;
  const secondLeasePromise = balancer.acquire({
    id: "req-replace-2",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "chat-local",
    stream: true,
  }).then((lease) => {
    secondResolved = true;
    return lease;
  });

  await delay(50);
  assert.equal(secondResolved, false);

  firstLease.release({
    outcome: "success",
    latencyMs: 75,
    statusCode: 200,
    queuedMs: firstLease.queueMs,
  });

  const secondLease = await secondLeasePromise;
  assert.equal(secondLease.backend.id, "llama-a");

  secondLease.release({
    outcome: "success",
    latencyMs: 65,
    statusCode: 200,
    queuedMs: secondLease.queueMs,
  });

  const snapshot = balancer.getSnapshot();
  assert.equal(snapshot.backends[0]?.activeRequests, 0);
  assert.equal(snapshot.backends[0]?.successfulRequests, 2);
});

test("retains only the configured number of recent requests", async () => {
  const balancer = new LoadBalancer({
    ...TEST_CONFIG,
    recentRequestLimit: 2,
  }, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
  });

  for (const requestId of ["req-limit-1", "req-limit-2", "req-limit-3"]) {
    const lease = await balancer.acquire({
      id: requestId,
      receivedAt: Date.now(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "chat-local",
      stream: true,
      requestBody: {
        model: "chat-local",
      },
    });

    lease.release({
      outcome: "success",
      latencyMs: 50,
      statusCode: 200,
      queuedMs: lease.queueMs,
      responseBody: {
        id: requestId,
      },
    });
  }

  const snapshot = balancer.getSnapshot();
  assert.equal(snapshot.recentRequestLimit, 2);
  assert.deepEqual(snapshot.recentRequests.map((entry) => entry.id), ["req-limit-3", "req-limit-2"]);
  assert.equal(balancer.getRequestLogDetail("req-limit-1"), undefined);
  assert.equal(balancer.getRequestLogDetail("req-limit-2")?.entry.id, "req-limit-2");
});

test("memory retention keeps full detail but stays bounded by recentRequestLimit", async () => {
  const recentRequestLimit = 5;
  const balancer = new LoadBalancer({
    ...TEST_CONFIG,
    recentRequestLimit,
  }, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
  });

  const largeMessages = Array.from({ length: 180 }, (_, index) => ({
    role: "user",
    content: `message-${index}-` + "x".repeat(4096),
  }));
  const largeToolCalls = Array.from({ length: 120 }, (_, index) => ({
    id: `call-${index}`,
    type: "function",
    function: {
      name: `tool_${index}`,
      arguments: JSON.stringify({
        index,
        payload: "y".repeat(2048),
      }),
    },
  }));

  for (let index = 0; index < 30; index += 1) {
    const lease = await balancer.acquire({
      id: `req-pressure-${index}`,
      receivedAt: Date.now(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "chat-local",
      stream: true,
      requestBody: {
        model: "chat-local",
        messages: largeMessages,
        metadata: Object.fromEntries(
          Array.from({ length: 180 }, (_, metadataIndex) => [
            `field_${metadataIndex}`,
            `value-${metadataIndex}-` + "z".repeat(256),
          ]),
        ),
      },
    });

    lease.release({
      outcome: "success",
      latencyMs: 25,
      statusCode: 200,
      queuedMs: lease.queueMs,
      finishReason: "stop",
      responseBody: {
        choices: [
          {
            message: {
              role: "assistant",
              content: "a".repeat(90_000),
              tool_calls: largeToolCalls,
            },
          },
        ],
      },
    });
  }

  const snapshot = balancer.getSnapshot();

  assert.equal(snapshot.recentRequests.length, recentRequestLimit);
  assert.equal(balancer.getRetainedRequestDetailCount(), recentRequestLimit);
  assert.equal(balancer.getDiagnosedRequestCount(), recentRequestLimit);

  const retainedDetail = balancer.getRequestLogDetail("req-pressure-29");
  const retainedSnapshot = balancer.getRetainedRequestDetailBodies("req-pressure-29");
  assert.ok(retainedDetail);
  assert.ok(retainedSnapshot);
  assert.equal(Array.isArray((retainedDetail?.requestBody as Record<string, unknown>)?.messages), true);
  assert.equal(((retainedDetail?.requestBody as Record<string, any>)?.messages ?? []).length, 180);
  assert.equal((retainedDetail?.requestBody as Record<string, any>)?.metadata?.field_179, `value-179-${"z".repeat(256)}`);
  assert.equal("__proxy_truncated_keys__" in ((retainedDetail?.requestBody as Record<string, any>)?.metadata ?? {}), false);
  assert.equal(
    ((((retainedDetail?.responseBody as Record<string, any>)?.choices?.[0]?.message?.content) ?? "") as string).length,
    90_000,
  );
  assert.equal(
    ((((retainedDetail?.responseBody as Record<string, any>)?.choices?.[0]?.message?.tool_calls) ?? []) as unknown[]).length,
    120,
  );

  const retainedBytes = snapshot.recentRequests.reduce((sum, entry) => {
    const detail = balancer.getRetainedRequestDetailBodies(entry.id);
    return sum + Buffer.byteLength(JSON.stringify(detail));
  }, 0);
  assert.equal(retainedBytes, recentRequestLimit * Buffer.byteLength(JSON.stringify(retainedSnapshot)));
});

test("stop rejects queued acquires and clears the queue immediately", async () => {
  const balancer = new LoadBalancer(TEST_CONFIG, {
    fetcher: async () => jsonResponse({ object: "list", data: [] }),
  });

  const firstLease = await balancer.acquire({
    id: "req-stop-first",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "chat-local",
    stream: true,
  });

  const queuedLeasePromise = balancer.acquire({
    id: "req-stop-queued",
    receivedAt: Date.now(),
    method: "POST",
    path: "/v1/chat/completions",
    model: "chat-local",
    stream: true,
  });

  await delay(50);
  const rejection = assert.rejects(queuedLeasePromise, /Load balancer stopped\./);
  await balancer.stop();
  await rejection;

  firstLease.release({
    outcome: "cancelled",
    latencyMs: 10,
    queuedMs: firstLease.queueMs,
    error: "Stopped during test.",
  });

  assert.equal(balancer.getSnapshot().queueDepth, 0);
});

test("stop aborts in-flight health refreshes", async () => {
  let fetchCalls = 0;
  let abortedCalls = 0;

  const balancer = new LoadBalancer(TEST_CONFIG, {
    fetcher: async (_input, init) => {
      fetchCalls += 1;
      const signal = init?.signal;

      return await new Promise<Response>((_resolve, reject) => {
        const onAbort = () => {
          abortedCalls += 1;
          reject(signal?.reason instanceof Error ? signal.reason : new Error("Health check aborted."));
        };

        if (signal?.aborted) {
          onAbort();
          return;
        }

        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
  });

  const deadline = Date.now() + 500;
  while (Date.now() < deadline && fetchCalls < TEST_CONFIG.connections.length) {
    await delay(10);
  }

  assert.equal(fetchCalls, TEST_CONFIG.connections.length);
  await balancer.stop();
  assert.equal(abortedCalls, fetchCalls);
});

test("applies health check interval changes without restarting the load balancer", async () => {
  let healthChecks = 0;
  const balancer = new LoadBalancer({
    ...TEST_CONFIG,
    healthCheckIntervalMs: 10_000,
  }, {
    fetcher: async () => {
      healthChecks += 1;
      return jsonResponse({ object: "list", data: [] });
    },
  });

  await balancer.start();
  const baselineChecks = healthChecks;

  balancer.replaceConfig({
    ...TEST_CONFIG,
    healthCheckIntervalMs: 25,
  });

  await delay(70);
  await balancer.stop();

  assert.ok(baselineChecks >= TEST_CONFIG.connections.length);
  assert.ok(
    healthChecks > baselineChecks,
    `expected health checks to increase after interval update, got ${baselineChecks} -> ${healthChecks}`,
  );
});

test("uses per-backend monitoring timeouts for health checks", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    requestTimeoutMs: 60_000,
    healthCheckIntervalMs: 60_000,
    connections: [
      {
        id: "monitor-timeout-backend",
        name: "Monitor Timeout Backend",
        baseUrl: "http://127.0.0.1:9720",
        enabled: true,
        maxConcurrency: 1,
        monitoringTimeoutMs: 30,
      },
    ],
  };

  let aborted = false;
  const balancer = new LoadBalancer(config, {
    fetcher: async (_input, init) => {
      const signal = init?.signal;

      return await new Promise<Response>((_resolve, reject) => {
        const onAbort = () => {
          aborted = true;
          reject(signal?.reason instanceof Error ? signal.reason : new Error("Health check aborted."));
        };

        if (signal?.aborted) {
          onAbort();
          return;
        }

        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
  });

  await balancer.start();
  await delay(60);

  const snapshot = balancer.getSnapshot();
  assert.equal(aborted, true);
  assert.equal(snapshot.backends[0]?.healthy, false);
  assert.match(snapshot.backends[0]?.lastError ?? "", /Timed out after 30ms\./);

  await balancer.stop();
});

test("schedules monitoring refreshes per backend interval", async () => {
  const healthChecksByPort = new Map<string, number>();
  const balancer = new LoadBalancer({
    ...TEST_CONFIG,
    healthCheckIntervalMs: 60_000,
    connections: [
      {
        id: "fast-monitor",
        name: "Fast Monitor",
        baseUrl: "http://127.0.0.1:9730",
        enabled: true,
        maxConcurrency: 1,
        monitoringIntervalMs: 25,
      },
      {
        id: "slow-monitor",
        name: "Slow Monitor",
        baseUrl: "http://127.0.0.1:9731",
        enabled: true,
        maxConcurrency: 1,
        monitoringIntervalMs: 200,
      },
    ],
  }, {
    fetcher: async (input) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      );
      healthChecksByPort.set(url.port, (healthChecksByPort.get(url.port) ?? 0) + 1);
      return jsonResponse({ object: "list", data: [] });
    },
  });

  await balancer.start();
  const fastBackendReachedExpectedInterval = await waitFor(
    () => (healthChecksByPort.get("9730") ?? 0) >= 3,
    {
      timeoutMs: 180,
      intervalMs: 10,
    },
  );
  await balancer.stop();

  assert.equal(fastBackendReachedExpectedInterval, true);
  assert.ok((healthChecksByPort.get("9730") ?? 0) >= 3);
  assert.equal(healthChecksByPort.get("9731") ?? 0, 1);
});

test("listKnownModels only exposes models that are currently routable", async () => {
  const config: AiClientConfig = {
    ...TEST_AI_CLIENT_SETTINGS,
    connections: [
      {
        id: "discovered-backend",
        name: "Discovered Backend",
        baseUrl: "http://127.0.0.1:9600",
        enabled: true,
        maxConcurrency: 1,
        models: ["live-*"],
      },
      {
        id: "configured-fallback",
        name: "Configured Fallback",
        baseUrl: "http://127.0.0.1:9601",
        enabled: true,
        maxConcurrency: 1,
        models: ["configured-only", "*"],
      },
      {
        id: "disabled-backend",
        name: "Disabled Backend",
        baseUrl: "http://127.0.0.1:9602",
        enabled: false,
        maxConcurrency: 1,
        models: ["disabled-model"],
      },
      {
        id: "unhealthy-backend",
        name: "Unhealthy Backend",
        baseUrl: "http://127.0.0.1:9603",
        enabled: true,
        maxConcurrency: 1,
        models: ["unhealthy-model"],
      },
    ],
  };

  const balancer = new LoadBalancer(config, {
    fetcher: async (input) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      );

      if (url.port === "9600") {
        return jsonResponse({
          object: "list",
          data: [{ id: "hidden-model" }, { id: "live-model" }],
        });
      }

      if (url.port === "9601") {
        return jsonResponse({ status: "ok" });
      }

      if (url.port === "9603") {
        return new Response("upstream failed", { status: 500 });
      }

      return jsonResponse({ status: "ok" });
    },
  });

  await balancer.start();

  assert.deepEqual(balancer.listKnownModels(), [
    {
      id: "configured-only",
      backendId: "configured-fallback",
      ownedBy: "Configured Fallback",
      source: "configured",
    },
    {
      id: "live-model",
      backendId: "discovered-backend",
      ownedBy: "Discovered Backend",
      source: "discovered",
    },
  ]);

  await balancer.stop();
});
