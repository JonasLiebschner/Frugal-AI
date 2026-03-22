import assert from "node:assert/strict";
import test from "node:test";

import {
  createHttpAiRequestRoutingMiddleware,
} from "../server/ai-request-middleware-capability";

test("configured HTTP request middleware posts a classifier query and maps the result to a concrete model", async () => {
  let capturedUrl = "";
  let capturedPayload: unknown;
  let capturedSignal: AbortSignal | null = null;
  const controller = new AbortController();
  const middleware = createHttpAiRequestRoutingMiddleware(
    {
      id: "external-router",
      url: "https://router.example.com/api/v1/classify",
      models: {
        small: "gpt-4.1-mini",
        large: "gpt-5",
      },
    },
    {
      fetcher: async (url, init) => {
        capturedUrl = String(url);
        capturedPayload = init?.body ? JSON.parse(String(init.body)) : undefined;
        capturedSignal = init?.signal ?? null;
        return new Response(JSON.stringify({
          result: "large",
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    },
  );

  const result = await middleware.route({
      route: {
        id: "request-1",
        receivedAt: Date.now(),
        method: "POST",
        path: "/v1/chat/completions",
        requestedModel: "middleware:external-router",
        model: "middleware:external-router",
        stream: false,
        contentType: "application/json",
        requestBody: {
          model: "middleware:external-router",
          messages: [
            {
              role: "user",
            content: "Route this request.",
          },
        ],
      },
      },
    requestedModel: "middleware:external-router",
    prompt: {
      kind: "chat",
      messages: [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: "Route this request.",
            },
          ],
          text: "Route this request.",
        },
      ],
      userText: "Route this request.",
      lastUserText: "Route this request.",
      toolNames: [],
    },
    knownModels: [
      {
        id: "gpt-5",
        backendId: "router-backend",
        ownedBy: "Router",
        source: "configured",
      },
    ],
    signal: controller.signal,
  });

  assert.equal(capturedUrl, "https://router.example.com/api/v1/classify");
  assert.equal(capturedSignal, controller.signal);
  assert.deepEqual(capturedPayload, {
    query: "Route this request.",
  });
  assert.deepEqual(result, {
    model: "gpt-5",
    metadata: {
      classification: "large",
    },
  });
});

test("configured HTTP request middleware prefers a directly returned routed model over the class mapping", async () => {
  const middleware = createHttpAiRequestRoutingMiddleware(
    {
      id: "external-router",
      url: "https://router.example.com/api/v1/classify",
      models: {
        small: "gpt-4.1-mini",
        large: "gpt-5",
      },
    },
    {
      fetcher: async () => new Response(JSON.stringify({
        model: "gpt-4.1",
        result: "large",
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    },
  );

  const result = await middleware.route({
    route: {
      id: "request-1b",
      receivedAt: Date.now(),
      method: "POST",
      path: "/v1/chat/completions",
      requestedModel: "middleware:external-router",
      model: "middleware:external-router",
      stream: false,
      contentType: "application/json",
      requestBody: {
        model: "middleware:external-router",
        messages: [
          {
            role: "user",
            content: "Route this request directly.",
          },
        ],
      },
    },
    requestedModel: "middleware:external-router",
    prompt: {
      kind: "chat",
      messages: [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: "Route this request directly.",
            },
          ],
          text: "Route this request directly.",
        },
      ],
      userText: "Route this request directly.",
      lastUserText: "Route this request directly.",
      toolNames: [],
    },
    knownModels: [],
  });

  assert.deepEqual(result, {
    model: "gpt-4.1",
    metadata: {
      model: "gpt-4.1",
      classification: "large",
    },
  });
});

test("configured HTTP request middleware surfaces upstream HTTP failures", async () => {
  const middleware = createHttpAiRequestRoutingMiddleware(
    {
      id: "external-router",
      url: "https://router.example.com/api/v1/classify",
      models: {
        small: "gpt-4.1-mini",
        large: "gpt-5",
      },
    },
    {
      fetcher: async () => new Response(JSON.stringify({
        error: {
          message: "Router unavailable",
        },
      }), {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      }),
    },
  );

  await assert.rejects(
    async () => await middleware.route({
      route: {
        id: "request-2",
        receivedAt: Date.now(),
        method: "POST",
        path: "/v1/chat/completions",
        model: "middleware:external-router",
        stream: false,
      },
      requestedModel: "middleware:external-router",
      prompt: {
        kind: "chat",
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "text",
                text: "Route this request.",
              },
            ],
            text: "Route this request.",
          },
        ],
        userText: "Route this request.",
        lastUserText: "Route this request.",
        toolNames: [],
      },
      knownModels: [],
    }),
    /AI request middleware "external-router" failed with HTTP 503: Router unavailable/u,
  );
});

test("configured HTTP request middleware skips requests that do not contain a classifier query", async () => {
  let called = false;
  const middleware = createHttpAiRequestRoutingMiddleware(
    {
      id: "external-router",
      url: "https://router.example.com/api/v1/classify",
      models: {
        small: "gpt-4.1-mini",
        large: "gpt-5",
      },
    },
    {
      fetcher: async () => {
        called = true;
        return new Response(JSON.stringify({ result: "small" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    },
  );

  const result = await middleware.route({
    route: {
      id: "request-3",
      receivedAt: Date.now(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "middleware:external-router",
      stream: false,
    },
    requestedModel: "middleware:external-router",
    prompt: null,
    knownModels: [],
  });

  assert.equal(called, false);
  assert.equal(result, undefined);
});
