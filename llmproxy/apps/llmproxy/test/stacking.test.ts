import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, get as httpGet, IncomingMessage, Server, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAiClientConfig } from "../../shared/test/ai-client-config";
import { delay, readRequestBody } from "./test-helpers";
import {
  getFreePort,
  startRouter,
  waitForActiveConnection,
  waitForHealthyBackend,
  waitForOuterState,
  waitForRecentRequest,
} from "./router-test-helpers";

async function startMockOpenAiBackend(
  port: number,
  streamModes: boolean[],
  receivedPayloads?: Array<Record<string, unknown>>,
  responseHeaders?: Record<string, string>,
): Promise<Server> {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method?.toUpperCase() ?? "GET";

    if (method === "GET" && url.pathname === "/v1/models") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        ...responseHeaders,
      });
      response.end(JSON.stringify({
        object: "list",
        data: [
          {
            id: "mock-stack-model",
            object: "model",
            created: 0,
            owned_by: "mock-openai-backend",
          },
        ],
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/v1/chat/completions") {
      const body = await readRequestBody(request);
      const payload = JSON.parse(body.toString("utf8")) as {
        stream?: boolean;
        model?: string;
      };
      receivedPayloads?.push(payload);
      streamModes.push(payload.stream === true);

      const chunks = [
        {
          id: "chatcmpl-mock-stack",
          object: "chat.completion.chunk",
          created: 1710000000,
          model: payload.model ?? "mock-stack-model",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: "Stacked ",
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-mock-stack",
          object: "chat.completion.chunk",
          created: 1710000000,
          model: payload.model ?? "mock-stack-model",
          choices: [
            {
              index: 0,
              delta: {
                content: "hello.",
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-mock-stack",
          object: "chat.completion.chunk",
          created: 1710000000,
          model: payload.model ?? "mock-stack-model",
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 2,
            total_tokens: 7,
          },
        },
      ];

      if (payload.stream === true) {
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          ...responseHeaders,
        });

        for (const chunk of chunks) {
          response.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        response.end("data: [DONE]\n\n");
        return;
      }

      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        ...responseHeaders,
      });
      response.end(JSON.stringify({
        id: "chatcmpl-mock-stack",
        object: "chat.completion",
        created: 1710000000,
        model: payload.model ?? "mock-stack-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "Stacked hello.",
            },
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 2,
          total_tokens: 7,
        },
      }));
      return;
    }

    response.writeHead(404, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({
      error: {
        message: `Unhandled mock route ${method} ${url.pathname}`,
        type: "invalid_request_error",
      },
    }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}

async function startMockOllamaBackend(
  port: number,
  receivedPayloads: Array<Record<string, unknown>>,
  streamModes: boolean[],
): Promise<Server> {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method?.toUpperCase() ?? "GET";

    if (method === "GET" && url.pathname === "/api/tags") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({
        models: [
          {
            name: "mock-ollama-model",
            model: "mock-ollama-model",
            modified_at: "2026-03-13T11:00:00Z",
            size: 123456,
            details: {
              format: "gguf",
              family: "qwen",
            },
          },
        ],
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/api/chat") {
      const body = await readRequestBody(request);
      const payload = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
      receivedPayloads.push(payload);
      streamModes.push(payload.stream === true);

      response.writeHead(200, {
        "content-type": "application/x-ndjson",
      });

      const chunks = [
        {
          model: payload.model ?? "mock-ollama-model",
          created_at: "2026-03-13T11:00:00.000Z",
          message: {
            role: "assistant",
            content: "",
            thinking: "Native reasoning.",
          },
          done: false,
        },
        {
          model: payload.model ?? "mock-ollama-model",
          created_at: "2026-03-13T11:00:00.100Z",
          message: {
            role: "assistant",
            content: "Native hello.",
          },
          done: false,
        },
        {
          model: payload.model ?? "mock-ollama-model",
          created_at: "2026-03-13T11:00:00.200Z",
          message: {
            role: "assistant",
            content: "",
          },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 7,
          prompt_eval_duration: 14_000_000,
          eval_count: 3,
          eval_duration: 30_000_000,
        },
      ];

      for (const chunk of chunks) {
        response.write(`${JSON.stringify(chunk)}\n`);
      }

      response.end();
      return;
    }

    response.writeHead(404, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({
      error: `Unhandled mock Ollama route ${method} ${url.pathname}`,
    }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}

async function startMockToolCallBackend(
  port: number,
  receivedPayloads: Array<Record<string, unknown>>,
): Promise<Server> {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method?.toUpperCase() ?? "GET";

    if (method === "GET" && url.pathname === "/v1/models") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({
        object: "list",
        data: [
          {
            id: "mock-tool-model",
            object: "model",
            created: 0,
            owned_by: "mock-tool-backend",
          },
        ],
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/v1/chat/completions") {
      const body = await readRequestBody(request);
      const payload = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
      receivedPayloads.push(payload);

      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      });

      const chunks = [
        {
          id: "chatcmpl-tool-flow",
          object: "chat.completion.chunk",
          created: 1710000100,
          model: payload.model ?? "mock-tool-model",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: "call_weather",
                    type: "function",
                    function: {
                      name: "get_weather",
                      arguments: "{\"city\":",
                    },
                  },
                  {
                    index: 1,
                    id: "call_time",
                    type: "function",
                    function: {
                      name: "get_time",
                      arguments: "{\"timezone\":",
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-tool-flow",
          object: "chat.completion.chunk",
          created: 1710000100,
          model: payload.model ?? "mock-tool-model",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: {
                      arguments: "\"Berlin\"}",
                    },
                  },
                  {
                    index: 1,
                    function: {
                      arguments: "\"Europe/Berlin\"}",
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-tool-flow",
          object: "chat.completion.chunk",
          created: 1710000100,
          model: payload.model ?? "mock-tool-model",
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "tool_calls",
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 9,
            total_tokens: 21,
          },
        },
      ];

      for (const chunk of chunks) {
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      response.end("data: [DONE]\n\n");
      return;
    }

    response.writeHead(404, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({
      error: {
        message: `Unhandled mock route ${method} ${url.pathname}`,
        type: "invalid_request_error",
      },
    }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}

async function startMockSlowStreamingBackend(
  port: number,
  modelMetadata?: Record<string, unknown>,
): Promise<Server> {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method?.toUpperCase() ?? "GET";

    if (method === "GET" && url.pathname === "/v1/models") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({
        object: "list",
        data: [
          {
            id: "mock-live-model",
            object: "model",
            created: 0,
            owned_by: "mock-live-backend",
            ...modelMetadata,
          },
        ],
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/v1/chat/completions") {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      });

      response.write(`data: ${JSON.stringify({
        id: "chatcmpl-live-1",
        object: "chat.completion.chunk",
        created: 1710000200,
        model: "mock-live-model",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: "Streaming ",
            },
            finish_reason: null,
          },
        ],
      })}\n\n`);

      await delay(200);

      response.write(`data: ${JSON.stringify({
        id: "chatcmpl-live-1",
        object: "chat.completion.chunk",
        created: 1710000200,
        model: "mock-live-model",
        choices: [
          {
            index: 0,
            delta: {
              content: "response.",
            },
            finish_reason: null,
          },
        ],
      })}\n\n`);

      await delay(200);

      response.write(`data: ${JSON.stringify({
        id: "chatcmpl-live-1",
        object: "chat.completion.chunk",
        created: 1710000200,
        model: "mock-live-model",
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 2,
          total_tokens: 10,
        },
      })}\n\n`);
      response.end("data: [DONE]\n\n");
      return;
    }

    response.writeHead(404, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({
      error: {
        message: `Unhandled mock route ${method} ${url.pathname}`,
        type: "invalid_request_error",
      },
    }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}

function buildLongStreamingFragments(fragmentCount: number, fragmentSize: number): string[] {
  return Array.from({ length: fragmentCount }, (_, index) => {
    const prefix = `segment-${String(index).padStart(4, "0")}:`;
    return `${prefix}${"x".repeat(Math.max(0, fragmentSize - prefix.length))}`;
  });
}

async function startMockLongStreamingBackend(
  port: number,
  fragments: string[],
): Promise<Server> {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method?.toUpperCase() ?? "GET";

    if (method === "GET" && url.pathname === "/v1/models") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({
        object: "list",
        data: [
          {
            id: "mock-long-model",
            object: "model",
            created: 0,
            owned_by: "mock-long-backend",
          },
        ],
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/v1/chat/completions") {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      });

      for (let index = 0; index < fragments.length; index += 1) {
        response.write(`data: ${JSON.stringify({
          id: "chatcmpl-long-stream",
          object: "chat.completion.chunk",
          created: 1710000300,
          model: "mock-long-model",
          choices: [
            {
              index: 0,
              delta: {
                ...(index === 0 ? { role: "assistant" } : {}),
                content: fragments[index],
              },
              finish_reason: null,
            },
          ],
        })}\n\n`);
      }

      response.write(`data: ${JSON.stringify({
        id: "chatcmpl-long-stream",
        object: "chat.completion.chunk",
        created: 1710000300,
        model: "mock-long-model",
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 16,
          completion_tokens: fragments.length,
          total_tokens: 16 + fragments.length,
        },
      })}\n\n`);
      response.end("data: [DONE]\n\n");
      return;
    }

    response.writeHead(404, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({
      error: {
        message: `Unhandled mock route ${method} ${url.pathname}`,
        type: "invalid_request_error",
      },
    }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}


function parseSseEvents<T>(payload: string): T[] {
  return payload
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");

      return data.length > 0 ? JSON.parse(data) as T : null;
    })
    .filter((entry): entry is T => entry !== null);
}

test("llmproxy can stack another llmproxy as an OpenAI-compatible backend", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-stack-"));
  const streamModes: boolean[] = [];
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const innerPort = await getFreePort();
  const outerPort = await getFreePort();

  const mockServer = await startMockOpenAiBackend(mockPort, streamModes);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const innerConfig = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-upstream",
        name: "mock upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-stack-model"],
      },
    ],
  });

  const innerRouter = await startRouter(innerConfig, path.join(tempDir, "inner-router.config.json"), { port: innerPort });
  cleanup.push(async () => {
    await innerRouter.server.stop();
    await innerRouter.loadBalancer.stop();
  });

  const outerConfig = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "inner-router",
        name: "inner router",
        baseUrl: `http://127.0.0.1:${innerPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
      },
    ],
  });

  const outerRouter = await startRouter(outerConfig, path.join(tempDir, "outer-router.config.json"), { port: outerPort });
  cleanup.push(async () => {
    await outerRouter.server.stop();
    await outerRouter.loadBalancer.stop();
  });

  const outerBaseUrl = `http://127.0.0.1:${outerPort}`;

  const statePayload = await waitForOuterState(outerBaseUrl);
  assert.equal(statePayload.backends[0]?.id, "inner-router");
  assert.equal(statePayload.backends[0]?.healthy, true);
  assert.deepEqual(statePayload.backends[0]?.discoveredModels, ["mock-stack-model"]);

  const modelsResponse = await fetch(`${outerBaseUrl}/v1/models`);
  assert.equal(modelsResponse.status, 200);
  const modelsPayload = await modelsResponse.json() as {
    object: string;
    data: Array<{ id: string; object: string; created: number; owned_by: string }>;
  };
  assert.equal(modelsPayload.object, "list");
  assert.deepEqual(
    modelsPayload.data.map((entry) => entry.id),
    ["mock-stack-model"],
  );
  assert.equal(modelsPayload.data[0]?.object, "model");
  assert.equal(modelsPayload.data[0]?.created, 0);
  assert.equal(modelsPayload.data[0]?.owned_by, "");
  assert.equal(
    Object.prototype.hasOwnProperty.call(modelsPayload.data[0] ?? {}, "metadata"),
    false,
  );

  const nonStreamingResponse = await fetch(`${outerBaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "mock-stack-model",
      stream: false,
      messages: [
        {
          role: "user",
          content: "Test stacked non-streaming.",
        },
      ],
    }),
  });
  assert.equal(nonStreamingResponse.status, 200);
  assert.equal(nonStreamingResponse.headers.get("x-ai-proxy-backend"), "inner-router");
  assert.ok(nonStreamingResponse.headers.get("x-ai-proxy-request-id"));
  const nonStreamingPayload = await nonStreamingResponse.json() as {
    object: string;
    choices: Array<{
      finish_reason: string | null;
      message: {
        role: string;
        content: string;
      };
    }>;
    usage?: {
      total_tokens?: number;
    };
  };
  assert.equal(nonStreamingPayload.object, "chat.completion");
  assert.equal(nonStreamingPayload.choices[0]?.message.role, "assistant");
  assert.equal(nonStreamingPayload.choices[0]?.message.content, "Stacked hello.");
  assert.equal(nonStreamingPayload.choices[0]?.finish_reason, "stop");
  assert.equal(nonStreamingPayload.usage?.total_tokens, 7);

  const requestedStreamingRequestId = "stacked-streaming-request";
  const streamingResponse = await fetch(`${outerBaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ai-proxy-request-id": requestedStreamingRequestId,
    },
    body: JSON.stringify({
      model: "mock-stack-model",
      stream: true,
      messages: [
        {
          role: "user",
          content: "Test stacked streaming.",
        },
      ],
    }),
  });
  assert.equal(streamingResponse.status, 200);
  assert.equal(streamingResponse.headers.get("x-ai-proxy-backend"), "inner-router");
  assert.equal(streamingResponse.headers.get("x-ai-proxy-request-id"), requestedStreamingRequestId);
  assert.match(
    streamingResponse.headers.get("content-type") ?? "",
    /text\/event-stream/i,
  );
  const streamingBody = await streamingResponse.text();
  assert.match(streamingBody, /"content":"Stacked "/);
  assert.match(streamingBody, /"content":"hello\."/);
  assert.match(streamingBody, /\[DONE\]/);

  const streamingDetailResponse = await fetch(
    `${outerBaseUrl}/api/llmproxy/admin/requests/${encodeURIComponent(requestedStreamingRequestId)}`,
  );
  assert.equal(streamingDetailResponse.status, 200);
  const streamingDetailPayload = await streamingDetailResponse.json() as {
    entry?: {
      id?: string;
      backendId?: string;
    };
  };
  assert.equal(streamingDetailPayload.entry?.id, requestedStreamingRequestId);
  assert.equal(streamingDetailPayload.entry?.backendId, "inner-router");

  const historyResponse = await fetch(`${outerBaseUrl}/api/llmproxy/admin/state`);
  assert.equal(historyResponse.status, 200);
  const historyPayload = await historyResponse.json() as {
    recentRequests: Array<{
      path: string;
      backendName?: string;
      completionTokens?: number;
      totalTokens?: number;
      contentTokens?: number;
      timeToFirstTokenMs?: number;
      finishReason?: string;
      metricsExact?: boolean;
    }>;
  };
  assert.equal(historyPayload.recentRequests[0]?.path, "/v1/chat/completions");
  assert.equal(historyPayload.recentRequests[0]?.backendName, "inner router");
  assert.equal(historyPayload.recentRequests[0]?.completionTokens, 2);
  assert.equal(historyPayload.recentRequests[0]?.totalTokens, 7);
  assert.equal(historyPayload.recentRequests[0]?.contentTokens, 2);
  assert.equal(historyPayload.recentRequests[0]?.finishReason, "stop");
  assert.equal(historyPayload.recentRequests[0]?.metricsExact, true);
  assert.equal(typeof historyPayload.recentRequests[0]?.timeToFirstTokenMs, "number");

  assert.deepEqual(streamModes, [true, true]);
});

test("OpenAI-compatible public routes support browser CORS and preflight requests", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-public-cors-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();
  const streamModes: boolean[] = [];

  const mockServer = await startMockOpenAiBackend(mockPort, streamModes, undefined, {
    "access-control-allow-origin": "https://backend.invalid",
    "access-control-expose-headers": "x-backend-only",
  });
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 10_000,
      queueTimeoutMs: 5_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1_000,
    },
    connections: [
      {
        id: "cors-upstream",
        name: "cors upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-stack-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "public-cors-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "cors-upstream");

  const preflightResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "OPTIONS",
    headers: {
      origin: "https://playground.example.com",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization, content-type, x-ai-proxy-request-id",
      "access-control-request-private-network": "true",
    },
  });

  assert.equal(preflightResponse.status, 204);
  assert.equal(preflightResponse.headers.get("access-control-allow-origin"), "https://playground.example.com");
  assert.equal(
    preflightResponse.headers.get("access-control-allow-headers"),
    "authorization, content-type, x-ai-proxy-request-id",
  );
  assert.equal(preflightResponse.headers.get("access-control-allow-private-network"), "true");
  assert.match(preflightResponse.headers.get("access-control-allow-methods") ?? "", /POST/);
  assert.match(preflightResponse.headers.get("access-control-expose-headers") ?? "", /x-ai-proxy-request-id/i);
  assert.match(preflightResponse.headers.get("access-control-expose-headers") ?? "", /x-ai-proxy-routing-middleware/i);
  assert.match(preflightResponse.headers.get("access-control-expose-headers") ?? "", /x-ai-proxy-routing-outcome/i);

  const modelsPreflightResponse = await fetch(`${baseUrl}/v1/models`, {
    method: "OPTIONS",
    headers: {
      origin: "https://playground.example.com",
      "access-control-request-method": "GET",
    },
  });

  assert.equal(modelsPreflightResponse.status, 204);
  assert.equal(modelsPreflightResponse.headers.get("access-control-allow-origin"), "https://playground.example.com");
  assert.match(modelsPreflightResponse.headers.get("access-control-allow-methods") ?? "", /GET/);

  const modelsResponse = await fetch(`${baseUrl}/v1/models`, {
    headers: {
      origin: "https://playground.example.com",
    },
  });

  assert.equal(modelsResponse.status, 200);
  assert.equal(modelsResponse.headers.get("access-control-allow-origin"), "https://playground.example.com");

  const chatResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      origin: "https://playground.example.com",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "mock-stack-model",
      stream: false,
      messages: [
        {
          role: "user",
          content: "Hello from a browser.",
        },
      ],
    }),
  });

  assert.equal(chatResponse.status, 200);
  assert.equal(chatResponse.headers.get("access-control-allow-origin"), "https://playground.example.com");
  assert.match(chatResponse.headers.get("access-control-expose-headers") ?? "", /x-ai-proxy-request-id/i);
  assert.match(chatResponse.headers.get("access-control-expose-headers") ?? "", /x-ai-proxy-backend/i);
  assert.match(chatResponse.headers.get("access-control-expose-headers") ?? "", /x-ai-proxy-model/i);
  assert.match(chatResponse.headers.get("access-control-expose-headers") ?? "", /x-ai-proxy-routing-middleware/i);
  assert.match(chatResponse.headers.get("access-control-expose-headers") ?? "", /x-ai-proxy-routing-outcome/i);
  assert.doesNotMatch(chatResponse.headers.get("access-control-expose-headers") ?? "", /x-backend-only/i);
  assert.ok(chatResponse.headers.get("x-ai-proxy-request-id"));
});

test("proxy rewrites auto model requests to the selected backend model", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-auto-model-"));
  const receivedPayloads: Array<Record<string, unknown>> = [];
  const streamModes: boolean[] = [];
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const upstreamPort = await getFreePort();
  const proxyPort = await getFreePort();

  const upstreamServer = await startMockOpenAiBackend(upstreamPort, streamModes, receivedPayloads);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      upstreamServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "auto-upstream",
        name: "auto upstream",
        baseUrl: `http://127.0.0.1:${upstreamPort}`,
        enabled: true,
        maxConcurrency: 1,
        models: ["*"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "auto-router.config.json"), { port: proxyPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${proxyPort}`;
  await waitForOuterState(baseUrl, "mock-stack-model");

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "auto",
      stream: false,
      messages: [
        {
          role: "user",
          content: "Hello through automatic model routing.",
        },
      ],
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-ai-proxy-backend"), "auto-upstream");
  const payload = await response.json() as {
    model?: string;
  };
  assert.equal(payload.model, "mock-stack-model");
  assert.equal(receivedPayloads[0]?.model, "mock-stack-model");
  assert.deepEqual(streamModes, [true]);
});

test("proxy rewrites missing model requests to the selected backend model", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-missing-model-"));
  const receivedPayloads: Array<Record<string, unknown>> = [];
  const streamModes: boolean[] = [];
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const upstreamPort = await getFreePort();
  const proxyPort = await getFreePort();

  const upstreamServer = await startMockOpenAiBackend(upstreamPort, streamModes, receivedPayloads);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      upstreamServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "missing-upstream",
        name: "missing upstream",
        baseUrl: `http://127.0.0.1:${upstreamPort}`,
        enabled: true,
        maxConcurrency: 1,
        models: ["*"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "missing-model-router.config.json"), { port: proxyPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${proxyPort}`;
  await waitForOuterState(baseUrl, "mock-stack-model");

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      stream: false,
      messages: [
        {
          role: "user",
          content: "Hello through implicit automatic model routing.",
        },
      ],
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-ai-proxy-backend"), "missing-upstream");
  const payload = await response.json() as {
    model?: string;
  };
  assert.equal(payload.model, "mock-stack-model");
  assert.equal(receivedPayloads[0]?.model, "mock-stack-model");
  assert.deepEqual(streamModes, [true]);
});

test("ollama connector keeps the client surface OpenAI-compatible", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-ollama-connector-"));
  const receivedPayloads: Array<Record<string, unknown>> = [];
  const streamModes: boolean[] = [];
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const ollamaPort = await getFreePort();
  const proxyPort = await getFreePort();

  const ollamaServer = await startMockOllamaBackend(ollamaPort, receivedPayloads, streamModes);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      ollamaServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "ollama-native",
        name: "ollama native",
        baseUrl: `http://127.0.0.1:${ollamaPort}`,
        connector: "ollama",
        enabled: true,
        maxConcurrency: 1,
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "ollama-router.config.json"), { port: proxyPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${proxyPort}`;
  const statePayload = await waitForOuterState(baseUrl, "mock-ollama-model");
  assert.equal(statePayload.backends[0]?.healthy, true);
  assert.deepEqual(statePayload.backends[0]?.discoveredModels, ["mock-ollama-model"]);

  const modelsResponse = await fetch(`${baseUrl}/v1/models`);
  assert.equal(modelsResponse.status, 200);
  const modelsPayload = await modelsResponse.json() as {
    object: string;
    data: Array<{ id: string }>;
  };
  assert.equal(modelsPayload.object, "list");
  assert.deepEqual(modelsPayload.data.map((entry) => entry.id), ["mock-ollama-model"]);

  const chatResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "mock-ollama-model",
      stream: false,
      max_tokens: 42,
      messages: [
        {
          role: "user",
          content: "Say hello natively.",
        },
      ],
    }),
  });
  assert.equal(chatResponse.status, 200);
  assert.equal(chatResponse.headers.get("x-ai-proxy-backend"), "ollama-native");
  assert.ok(chatResponse.headers.get("x-ai-proxy-request-id"));
  const chatPayload = await chatResponse.json() as {
    object: string;
    choices: Array<{
      finish_reason: string | null;
      message: {
        role: string;
        content: string;
        reasoning_content?: string;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  assert.equal(chatPayload.object, "chat.completion");
  assert.equal(chatPayload.choices[0]?.message.role, "assistant");
  assert.equal(chatPayload.choices[0]?.message.content, "Native hello.");
  assert.equal(chatPayload.choices[0]?.message.reasoning_content, "Native reasoning.");
  assert.equal(chatPayload.choices[0]?.finish_reason, "stop");
  assert.deepEqual(chatPayload.usage, {
    prompt_tokens: 7,
    completion_tokens: 3,
    total_tokens: 10,
  });

  assert.deepEqual(streamModes, [true]);
  assert.equal(receivedPayloads[0]?.stream, true);
  assert.deepEqual(receivedPayloads[0]?.messages, [
    {
      role: "user",
      content: "Say hello natively.",
    },
  ]);
  assert.deepEqual(receivedPayloads[0]?.options, {
    num_predict: 42,
  });
});

test("proxy preserves OpenAI token limit fields for non-streaming chat clients", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-tool-flow-"));
  const receivedPayloads: Array<Record<string, unknown>> = [];
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();

  const mockServer = await startMockToolCallBackend(mockPort, receivedPayloads);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-tool-upstream",
        name: "mock tool upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-tool-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "tool-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-tool-upstream");

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "mock-tool-model",
      stream: false,
      max_tokens: 777,
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get the weather.",
            parameters: {
              type: "object",
            },
          },
        },
        {
          type: "function",
          function: {
            name: "get_time",
            description: "Get the current time.",
            parameters: {
              type: "object",
            },
          },
        },
      ],
      messages: [
        {
          role: "user",
          content: "Call both tools.",
        },
      ],
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-ai-proxy-backend"), "mock-tool-upstream");

  const payload = await response.json() as {
    object: string;
    choices: Array<{
      finish_reason: string | null;
      message: {
        role: string;
        content: string | null;
        tool_calls?: Array<{
          id?: string;
          type?: string;
          function?: {
            name?: string;
            arguments: string;
          };
        }>;
      };
    }>;
    usage?: {
      total_tokens?: number;
    };
  };

  assert.equal(payload.object, "chat.completion");
  assert.equal(payload.choices[0]?.finish_reason, "tool_calls");
  assert.equal(payload.choices[0]?.message.role, "assistant");
  assert.equal(payload.choices[0]?.message.content, null);
  assert.deepEqual(payload.choices[0]?.message.tool_calls, [
    {
      id: "call_weather",
      type: "function",
      function: {
        name: "get_weather",
        arguments: "{\"city\":\"Berlin\"}",
      },
    },
    {
      id: "call_time",
      type: "function",
      function: {
        name: "get_time",
        arguments: "{\"timezone\":\"Europe/Berlin\"}",
      },
    },
  ]);
  assert.equal(payload.usage?.total_tokens, 21);

  const stateResponse = await fetch(`${baseUrl}/api/llmproxy/admin/state`);
  assert.equal(stateResponse.status, 200);
  const statePayload = await stateResponse.json() as {
    recentRequests: Array<{
      id: string;
      path: string;
      hasDetail?: boolean;
    }>;
  };
  assert.equal(statePayload.recentRequests[0]?.path, "/v1/chat/completions");
  assert.equal(statePayload.recentRequests[0]?.hasDetail, true);

  const detailResponse = await fetch(`${baseUrl}/api/llmproxy/admin/requests/${encodeURIComponent(statePayload.recentRequests[0]?.id ?? "")}`);
  assert.equal(detailResponse.status, 200);
  const detailPayload = await detailResponse.json() as {
    requestBody?: {
      model?: string;
      stream?: boolean;
      max_tokens?: number;
      messages?: Array<{
        role?: string;
        content?: string;
      }>;
      tools?: unknown[];
    };
    responseBody?: {
      choices?: Array<{
        finish_reason?: string | null;
        message?: {
          tool_calls?: Array<{
            function?: {
              name?: string;
              arguments?: string;
            };
          }>;
        };
      }>;
    };
  };
  assert.equal(detailPayload.requestBody?.model, "mock-tool-model");
  assert.equal(detailPayload.requestBody?.stream, false);
  assert.equal(detailPayload.requestBody?.max_tokens, 777);
  assert.equal(detailPayload.requestBody?.messages?.[0]?.role, "user");
  assert.equal(detailPayload.requestBody?.messages?.[0]?.content, "Call both tools.");
  assert.equal(Array.isArray(detailPayload.requestBody?.tools), true);
  assert.equal(detailPayload.responseBody?.choices?.[0]?.finish_reason, "tool_calls");
  assert.equal(detailPayload.responseBody?.choices?.[0]?.message?.tool_calls?.[0]?.function?.name, "get_weather");
  assert.equal(
    detailPayload.responseBody?.choices?.[0]?.message?.tool_calls?.[1]?.function?.arguments,
    "{\"timezone\":\"Europe/Berlin\"}",
  );

  assert.equal(receivedPayloads.length, 1);
  assert.equal(receivedPayloads[0]?.stream, true);
  assert.equal(receivedPayloads[0]?.max_tokens, 777);
  assert.equal("max_completion_tokens" in receivedPayloads[0]!, false);
  assert.equal(Array.isArray(receivedPayloads[0]?.tools), true);
  assert.equal((receivedPayloads[0]?.tools as unknown[]).length, 2);
});

test("non-streaming clients and retained history both keep the full synthesized response", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-long-json-from-stream-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();
  const fragments = buildLongStreamingFragments(140, 1_120);
  const expectedContent = fragments.join("");

  const mockServer = await startMockLongStreamingBackend(mockPort, fragments);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-long-upstream",
        name: "mock long upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-long-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "long-json-from-stream-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-long-upstream");

  const requestId = "long-json-from-stream-request";
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ai-proxy-request-id": requestId,
    },
    body: JSON.stringify({
      model: "mock-long-model",
      stream: false,
      messages: [
        {
          role: "user",
          content: "Return a very long answer.",
        },
      ],
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-ai-proxy-request-id"), requestId);
  const payload = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content ?? "";
  assert.equal(content.length, expectedContent.length);
  assert.equal(content, expectedContent);
  assert.doesNotMatch(content, /truncated to protect memory/);
  assert.doesNotMatch(content, /truncated to reduce memory usage/);

  await waitForRecentRequest(baseUrl, (entry) => entry.id === requestId);
  const detailResponse = await fetch(`${baseUrl}/api/llmproxy/admin/requests/${encodeURIComponent(requestId)}`);
  assert.equal(detailResponse.status, 200);
  const detailPayload = await detailResponse.json() as {
    responseBody?: {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };
  };

  const retainedContent = detailPayload.responseBody?.choices?.[0]?.message?.content ?? "";
  assert.equal(retainedContent.length, expectedContent.length);
  assert.equal(retainedContent, expectedContent);
  assert.doesNotMatch(retainedContent, /truncated to reduce memory usage/);
});

test("active connections expose live request details for chat history inspection", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-live-detail-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();

  const mockServer = await startMockSlowStreamingBackend(mockPort, {
    max_completion_tokens: 256,
  });
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-live-upstream",
        name: "mock live upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-live-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "live-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-live-upstream");
  const requestedRequestId = "chat-debug-live-request";
  const liveMessages = Array.from({ length: 80 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `history-${index}`,
  }));

  const liveResponsePromise = fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ai-proxy-request-id": requestedRequestId,
    },
    body: JSON.stringify({
      model: "mock-live-model",
      max_completion_tokens: 128,
      stream: true,
      messages: liveMessages,
    }),
  });

  const activeConnection = await waitForActiveConnection(baseUrl);
  assert.equal(activeConnection.id, requestedRequestId);
  assert.equal(activeConnection.path, "/v1/chat/completions");
  assert.equal(activeConnection.hasDetail, true);
  assert.equal(activeConnection.effectiveCompletionTokenLimit, 128);

  const detailResponse = await fetch(`${baseUrl}/api/llmproxy/admin/requests/${encodeURIComponent(activeConnection.id)}`);
  assert.equal(detailResponse.status, 200);
  const detailPayload = await detailResponse.json() as {
    live?: boolean;
    requestBody?: {
      model?: string;
      max_completion_tokens?: number;
      stream?: boolean;
      messages?: Array<{
        role?: string;
        content?: string;
      }>;
    };
    responseBody?: {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
  };

  assert.equal(detailPayload.live, true);
  assert.equal(detailPayload.requestBody?.model, "mock-live-model");
  assert.equal(detailPayload.requestBody?.max_completion_tokens, 128);
  assert.equal(detailPayload.requestBody?.stream, true);
  assert.equal(detailPayload.requestBody?.messages?.length, liveMessages.length);
  assert.equal(detailPayload.requestBody?.messages?.[0]?.role, liveMessages[0]?.role);
  assert.equal(detailPayload.requestBody?.messages?.[0]?.content, liveMessages[0]?.content);
  assert.equal(detailPayload.requestBody?.messages?.[79]?.role, liveMessages[79]?.role);
  assert.equal(detailPayload.requestBody?.messages?.[79]?.content, liveMessages[79]?.content);
  assert.match(detailPayload.responseBody?.choices?.[0]?.message?.content ?? "", /Streaming/);

  const liveResponse = await liveResponsePromise;
  assert.equal(liveResponse.status, 200);
  assert.equal(liveResponse.headers.get("x-ai-proxy-request-id"), requestedRequestId);
  const liveBody = await liveResponse.text();
  assert.match(liveBody, /Streaming /);
  assert.match(liveBody, /response\./);

  await waitForRecentRequest(baseUrl, (entry) => entry.id === requestedRequestId);
  const stateResponse = await fetch(`${baseUrl}/api/llmproxy/admin/state`);
  assert.equal(stateResponse.status, 200);
  const statePayload = await stateResponse.json() as {
    recentRequests: Array<{
      id: string;
      effectiveCompletionTokenLimit?: number;
    }>;
  };
  assert.equal(
    statePayload.recentRequests.find((entry) => entry.id === requestedRequestId)?.effectiveCompletionTokenLimit,
    128,
  );
});

test("dashboard SSE streams live request_detail events before and after completion", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-live-detail-sse-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();

  const mockServer = await startMockSlowStreamingBackend(mockPort);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-live-detail-sse-upstream",
        name: "mock live detail sse upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-live-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "live-detail-sse-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-live-detail-sse-upstream");
  const requestedRequestId = "chat-debug-live-sse-request";

  const liveResponsePromise = fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ai-proxy-request-id": requestedRequestId,
    },
    body: JSON.stringify({
      model: "mock-live-model",
      stream: true,
      messages: [
        {
          role: "user",
          content: "Stream request detail updates.",
        },
      ],
    }),
  });

  const activeConnection = await waitForActiveConnection(baseUrl);
  assert.equal(activeConnection.id, requestedRequestId);

  const eventsAbortController = new AbortController();
  const detailEventsResponse = await fetch(`${baseUrl}/api/llmproxy/admin/requests/${encodeURIComponent(requestedRequestId)}/events`, {
    signal: eventsAbortController.signal,
  });
  assert.equal(detailEventsResponse.status, 200);
  assert.match(detailEventsResponse.headers.get("content-type") ?? "", /text\/event-stream/);
  const detailReader = detailEventsResponse.body?.getReader();
  assert.ok(detailReader);

  let detailEventsPayload = "";
  let sawLiveRequestDetail = false;
  const readDeadline = Date.now() + 600;

  while (Date.now() < readDeadline && !sawLiveRequestDetail) {
    const next = await Promise.race([
      detailReader!.read(),
      delay(80).then(() => null),
    ]);

    if (!next) {
      continue;
    }

    if (next.done) {
      break;
    }

    detailEventsPayload += new TextDecoder().decode(next.value);
    const detailEvents = parseSseEvents<{
      live?: boolean;
      entry?: {
        id?: string;
      };
      responseBody?: {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };
    }>(detailEventsPayload).filter((entry) => entry.entry?.id === requestedRequestId);

    sawLiveRequestDetail = detailEvents.some((entry) => entry.live === true);
  }

  assert.equal(sawLiveRequestDetail, true);
  assert.match(detailEventsPayload, /event: request_detail/);

  const liveResponse = await liveResponsePromise;
  assert.equal(liveResponse.status, 200);
  const liveBody = await liveResponse.text();
  assert.match(liveBody, /Streaming /);
  assert.match(liveBody, /response\./);

  let detailEvents = parseSseEvents<{
    live?: boolean;
    entry?: {
      id?: string;
    };
    responseBody?: {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
  }>(detailEventsPayload).filter((entry) => entry.entry?.id === requestedRequestId);

  const finalDeadline = Date.now() + 800;
  while (
    Date.now() < finalDeadline &&
    !detailEvents.some((entry) => entry.live !== true)
  ) {
    const next = await Promise.race([
      detailReader!.read(),
      delay(80).then(() => null),
    ]);

    if (!next) {
      continue;
    }

    if (next.done) {
      break;
    }

    detailEventsPayload += new TextDecoder().decode(next.value);
    detailEvents = parseSseEvents<{
      live?: boolean;
      entry?: {
        id?: string;
      };
      responseBody?: {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };
    }>(detailEventsPayload).filter((entry) => entry.entry?.id === requestedRequestId);
  }

  eventsAbortController.abort();

  assert.ok(detailEvents.length >= 2);
  assert.equal(detailEvents.some((entry) => entry.live === true), true);
  assert.match(
    detailEvents.find((entry) => entry.live === true)?.responseBody?.choices?.[0]?.message?.content ?? "",
    /Streaming/,
  );
  assert.notEqual(detailEvents[detailEvents.length - 1]?.live, true);
  assert.match(
    detailEvents[detailEvents.length - 1]?.responseBody?.choices?.[0]?.message?.content ?? "",
    /Streaming response\./,
  );
});

test("live request content is only materialized while request detail subscribers exist", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-live-detail-lazy-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();

  const mockServer = await startMockSlowStreamingBackend(mockPort);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-live-detail-lazy-upstream",
        name: "mock live detail lazy upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-live-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "live-detail-lazy-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-live-detail-lazy-upstream");
  const requestId = "chat-debug-live-lazy-request";

  const liveResponsePromise = fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ai-proxy-request-id": requestId,
    },
    body: JSON.stringify({
      model: "mock-live-model",
      stream: true,
      messages: [
        {
          role: "user",
          content: "Open lazy live detail stream.",
        },
      ],
    }),
  });

  await waitForActiveConnection(baseUrl);
  await delay(80);

  const activeRuntimeBeforeSubscribe = router.server.inspectActiveConnection(requestId);
  assert.ok(activeRuntimeBeforeSubscribe);
  assert.equal(activeRuntimeBeforeSubscribe.responseBody, undefined);
  assert.equal(activeRuntimeBeforeSubscribe.hasStreamingPayload, true);

  const detailResponse = await fetch(`${baseUrl}/api/llmproxy/admin/requests/${encodeURIComponent(requestId)}/events`);
  assert.equal(detailResponse.status, 200);
  const detailReader = detailResponse.body?.getReader();
  assert.ok(detailReader);

  const firstEvent = await detailReader!.read();
  assert.equal(firstEvent.done, false);
  const firstPayload = new TextDecoder().decode(firstEvent.value);
  const detailEvents = parseSseEvents<{
    responseBody?: {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
  }>(firstPayload);
  assert.match(detailEvents[0]?.responseBody?.choices?.[0]?.message?.content ?? "", /Streaming/);

  await delay(260);

  const activeRuntimeAfterSubscribe = router.server.inspectActiveConnection(requestId);
  assert.ok(activeRuntimeAfterSubscribe);
  assert.notEqual(activeRuntimeAfterSubscribe.responseBody, undefined);

  await detailReader.cancel().catch(() => undefined);
  const liveResponse = await liveResponsePromise;
  assert.equal(liveResponse.status, 200);
});

test("dashboard SSE sends snapshot_delta events without global request_detail payloads", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-dashboard-sse-delta-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();

  const mockServer = await startMockSlowStreamingBackend(mockPort);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-dashboard-delta-upstream",
        name: "mock dashboard delta upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-live-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "dashboard-sse-delta-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-dashboard-delta-upstream");

  const eventsAbortController = new AbortController();
  const eventsResponse = await fetch(`${baseUrl}/api/llmproxy/admin/events`, {
    signal: eventsAbortController.signal,
  });
  assert.equal(eventsResponse.status, 200);
  assert.match(eventsResponse.headers.get("content-type") ?? "", /text\/event-stream/);
  const reader = eventsResponse.body?.getReader();
  assert.ok(reader);

  let eventsPayload = "";
  const firstChunk = await reader!.read();
  assert.equal(firstChunk.done, false);
  eventsPayload += new TextDecoder().decode(firstChunk.value);
  assert.match(eventsPayload, /event: snapshot/);

  const liveResponsePromise = fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "mock-live-model",
      stream: true,
      messages: [
        {
          role: "user",
          content: "Produce dashboard delta traffic.",
        },
      ],
    }),
  });

  let sawSnapshotDelta = false;
  const deltaDeadline = Date.now() + 1200;
  while (Date.now() < deltaDeadline && !sawSnapshotDelta) {
    const next = await Promise.race([
      reader!.read(),
      delay(80).then(() => null),
    ]);

    if (!next) {
      continue;
    }

    if (next.done) {
      break;
    }

    eventsPayload += new TextDecoder().decode(next.value);
    sawSnapshotDelta = /event: snapshot_delta/.test(eventsPayload);
  }

  eventsAbortController.abort();
  const liveResponse = await liveResponsePromise;
  assert.equal(liveResponse.status, 200);

  assert.equal(sawSnapshotDelta, true);
  assert.doesNotMatch(eventsPayload, /event: request_detail/);
});

test("dashboard SSE snapshot_delta keeps in-flight request metrics updated", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-dashboard-sse-live-metrics-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();

  const mockServer = await startMockSlowStreamingBackend(mockPort);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-dashboard-live-metrics-upstream",
        name: "mock dashboard live metrics upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-live-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "dashboard-sse-live-metrics-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-dashboard-live-metrics-upstream");
  const requestId = "dashboard-live-metrics-request";

  const eventsAbortController = new AbortController();
  const eventsResponse = await fetch(`${baseUrl}/api/llmproxy/admin/events`, {
    signal: eventsAbortController.signal,
  });
  assert.equal(eventsResponse.status, 200);
  const reader = eventsResponse.body?.getReader();
  assert.ok(reader);

  const initialChunk = await reader!.read();
  assert.equal(initialChunk.done, false);

  const liveResponsePromise = fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ai-proxy-request-id": requestId,
    },
    body: JSON.stringify({
      model: "mock-live-model",
      stream: true,
      messages: [
        {
          role: "user",
          content: "Keep live metrics moving.",
        },
      ],
    }),
  });

  let eventsPayload = "";
  let metricUpdate:
    | {
        id?: string;
        contentTokens?: number;
        completionTokens?: number;
        completionTokensPerSecond?: number;
        elapsedMs?: number;
      }
    | undefined;
  const deadline = Date.now() + 2200;

  while (Date.now() < deadline && !metricUpdate) {
    const next = await Promise.race([
      reader!.read(),
      delay(80).then(() => null),
    ]);

    if (!next) {
      continue;
    }

    if (next.done) {
      break;
    }

    eventsPayload += new TextDecoder().decode(next.value);
    const events = parseSseEvents<{
      activeConnections?: {
        upserted?: Array<{
          id?: string;
          contentTokens?: number;
          completionTokens?: number;
          completionTokensPerSecond?: number;
          elapsedMs?: number;
        }>;
      };
    }>(eventsPayload);

    metricUpdate = events
      .flatMap((event) => event.activeConnections?.upserted ?? [])
      .find((entry) => (
        entry.id === requestId
        && (
          typeof entry.contentTokens === "number"
          || typeof entry.completionTokens === "number"
          || typeof entry.completionTokensPerSecond === "number"
        )
      ));
  }

  eventsAbortController.abort();
  const liveResponse = await liveResponsePromise;
  assert.equal(liveResponse.status, 200);

  assert.ok(metricUpdate);
  assert.equal(metricUpdate.id, requestId);
  assert.equal(typeof metricUpdate.elapsedMs, "number");
  assert.ok(
    typeof metricUpdate.contentTokens === "number"
      || typeof metricUpdate.completionTokens === "number"
      || typeof metricUpdate.completionTokensPerSecond === "number",
  );
  assert.doesNotMatch(eventsPayload, /responseBody/);
});

test("dashboard SSE clients are released after disconnect churn", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-sse-churn-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();
  const streamModes: boolean[] = [];

  const mockServer = await startMockOpenAiBackend(mockPort, streamModes);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-sse-churn-upstream",
        name: "mock sse churn upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-stack-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "sse-churn-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-sse-churn-upstream");

  const connections = await Promise.all(
    Array.from({ length: 40 }, async () => {
      const controller = new AbortController();
      const response = await fetch(`${baseUrl}/api/llmproxy/admin/events`, {
        signal: controller.signal,
      });
      assert.equal(response.status, 200);
      return {
        controller,
        reader: response.body?.getReader(),
      };
    }),
  );

  const connectedDeadline = Date.now() + 800;
  while (Date.now() < connectedDeadline && router.server.getDashboardSseClientCount() < connections.length) {
    await delay(20);
  }

  assert.equal(router.server.getDashboardSseClientCount(), connections.length);

  await Promise.allSettled(connections.map(async ({ controller, reader }) => {
    controller.abort();
    if (reader) {
      await reader.cancel().catch(() => undefined);
    }
  }));

  const disconnectedDeadline = Date.now() + 800;
  while (Date.now() < disconnectedDeadline && router.server.getDashboardSseClientCount() !== 0) {
    await delay(20);
  }

  assert.equal(router.server.getDashboardSseClientCount(), 0);
});

test("dashboard SSE drops stalled clients before buffers grow unbounded", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-sse-backpressure-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();

  const mockServer = await startMockSlowStreamingBackend(mockPort);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-sse-backpressure-upstream",
        name: "mock sse backpressure upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 2,
        healthPath: "/v1/models",
        models: ["mock-live-model"],
      },
    ],
  });

  const router = await startRouter(
    config,
    path.join(tempDir, "sse-backpressure-router.config.json"),
    { maxSseClientBufferBytes: 12_000, port: routerPort },
  );
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-sse-backpressure-upstream");

  const stalledConnection = await new Promise<{
    request: ReturnType<typeof httpGet>;
    response: IncomingMessage;
  }>((resolve, reject) => {
    const request = httpGet(`${baseUrl}/api/llmproxy/admin/events`, (response) => {
      response.pause();
      resolve({ request, response });
    });

    request.once("error", reject);
  });

  cleanup.push(async () => {
    stalledConnection.request.destroy();
    stalledConnection.response.destroy();
  });

  const connectedDeadline = Date.now() + 800;
  while (Date.now() < connectedDeadline && router.server.getDashboardSseClientCount() !== 1) {
    await delay(20);
  }

  assert.equal(router.server.getDashboardSseClientCount(), 1);

  await Promise.all(Array.from({ length: 4 }, (_, index) => fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "mock-live-model",
      stream: true,
      messages: [
        {
          role: "system",
          content: `system-${index}-` + "s".repeat(12_000),
        },
        {
          role: "user",
          content: `user-${index}-` + "u".repeat(12_000),
        },
      ],
    }),
  }).then(async (response) => {
    try {
      await response.text();
    } catch {
      // The proxy can terminate streaming responses abruptly when the upstream fails.
    }
  })));

  const droppedDeadline = Date.now() + 4_000;
  while (Date.now() < droppedDeadline && router.server.getDashboardSseClientCount() > 0) {
    await delay(20);
  }

  assert.equal(router.server.getDashboardSseClientCount(), 0);
});

test("cancelled requests retain the partial streamed response in request history", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-cancelled-history-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();

  const mockServer = await startMockSlowStreamingBackend(mockPort);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-cancel-upstream",
        name: "mock cancel upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-live-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "cancel-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-cancel-upstream");

  const clientAbortController = new AbortController();
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "mock-live-model",
      stream: true,
      messages: [
        {
          role: "user",
          content: "Cancel after the first streamed chunk.",
        },
      ],
    }),
    signal: clientAbortController.signal,
  });

  assert.equal(response.status, 200);
  const reader = response.body?.getReader();
  assert.ok(reader);

  const firstChunk = await reader.read();
  assert.equal(firstChunk.done, false);
  const firstChunkText = new TextDecoder().decode(firstChunk.value);
  assert.match(firstChunkText, /Streaming /);

  clientAbortController.abort(new Error("Client cancelled request."));

  try {
    await reader.read();
  } catch {
    // Node fetch rejects the body stream once the client aborts, which is expected here.
  }

  const cancelledEntry = await waitForRecentRequest(baseUrl, (entry) => (
    entry.path === "/v1/chat/completions" && entry.outcome === "cancelled"
  ));

  const detailResponse = await fetch(`${baseUrl}/api/llmproxy/admin/requests/${encodeURIComponent(cancelledEntry.id)}`);
  assert.equal(detailResponse.status, 200);
  const detailPayload = await detailResponse.json() as {
    entry: {
      outcome: string;
    };
    responseBody?: {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };
  };

  assert.equal(detailPayload.entry.outcome, "cancelled");
  assert.match(detailPayload.responseBody?.choices?.[0]?.message?.content ?? "", /Streaming/);
});

test("raw upstream HTTP 400 responses are retained, noted, and diagnosed as errors", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-raw-upstream-400-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();

  const mockServer = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method?.toUpperCase() ?? "GET";

    if (method === "GET" && url.pathname === "/v1/models") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({
        object: "list",
        data: [
          {
            id: "mock-bad-request-model",
            object: "model",
            created: 0,
            owned_by: "mock-openai-backend",
          },
        ],
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/v1/chat/completions") {
      await readRequestBody(request);
      response.writeHead(400, {
        "content-type": "application/json; charset=utf-8",
        "x-mock-error": "true",
      });
      response.end(JSON.stringify({
        error: {
          message: "The server had an error while processing your request. Sorry about that! Please retry.",
          type: "invalid_request_error",
          code: "bad_request",
        },
      }));
      return;
    }

    response.writeHead(404, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({
      error: {
        message: `Unhandled mock route ${method} ${url.pathname}`,
        type: "invalid_request_error",
      },
    }));
  });
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    mockServer.once("error", reject);
    mockServer.listen(mockPort, "127.0.0.1", () => {
      mockServer.off("error", reject);
      resolve();
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-raw-error-upstream",
        name: "mock raw error upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-bad-request-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "raw-upstream-400-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-raw-error-upstream");

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "mock-bad-request-model",
      stream: false,
      messages: [
        {
          role: "user",
          content: "Hello.",
        },
      ],
    }),
  });

  const requestId = response.headers.get("x-ai-proxy-request-id");
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("x-mock-error"), "true");
  assert.ok(requestId);

  const responsePayload = await response.json() as {
    error?: {
      message?: string;
      type?: string;
      code?: string;
    };
  };
  assert.equal(responsePayload.error?.message, "The server had an error while processing your request. Please retry.");
  assert.equal(responsePayload.error?.type, "invalid_request_error");
  assert.equal(responsePayload.error?.code, "bad_request");

  await waitForRecentRequest(baseUrl, (entry) => (
    entry.id === requestId && entry.outcome === "error"
  ));

  const stateResponse = await fetch(`${baseUrl}/api/llmproxy/admin/state`);
  assert.equal(stateResponse.status, 200);
  const statePayload = await stateResponse.json() as {
    recentRequests: Array<{
      id: string;
      outcome: string;
      statusCode?: number;
      error?: string;
    }>;
    backends: Array<{
      id: string;
      healthy: boolean;
      failedRequests: number;
    }>;
  };
  const recentEntry = statePayload.recentRequests.find((entry) => entry.id === requestId);
  const backendState = statePayload.backends.find((backend) => backend.id === "mock-raw-error-upstream");

  assert.equal(recentEntry?.outcome, "error");
  assert.equal(recentEntry?.statusCode, 400);
  assert.equal(recentEntry?.error, "The server had an error while processing your request. Please retry.");
  assert.equal(backendState?.healthy, false);
  assert.equal(backendState?.failedRequests, 1);

  const detailResponse = await fetch(`${baseUrl}/api/llmproxy/admin/requests/${encodeURIComponent(requestId ?? "")}`);
  assert.equal(detailResponse.status, 200);
  const detailPayload = await detailResponse.json() as {
    entry: {
      outcome: string;
      statusCode?: number;
      error?: string;
    };
    responseBody?: {
      error?: {
        message?: string;
        type?: string;
        code?: string;
      };
    };
  };

  assert.equal(detailPayload.entry.outcome, "error");
  assert.equal(detailPayload.entry.statusCode, 400);
  assert.equal(detailPayload.entry.error, "The server had an error while processing your request. Please retry.");
  assert.equal(
    detailPayload.responseBody?.error?.message,
    "The server had an error while processing your request. Sorry about that! Please retry.",
  );
  assert.equal(detailPayload.responseBody?.error?.type, "invalid_request_error");

  const diagnosticsResponse = await fetch(`${baseUrl}/api/llmproxy/admin/diagnostics/requests/${encodeURIComponent(requestId ?? "")}`);
  assert.equal(diagnosticsResponse.status, 200);
  const diagnosticsPayload = await diagnosticsResponse.json() as {
    report: {
      summary: string;
      outputPreview: string;
      signals: {
        upstreamError: boolean;
      };
      findings: Array<{
        code: string;
        evidence?: string[];
      }>;
    };
  };
  const upstreamFinding = diagnosticsPayload.report.findings.find((finding) => finding.code === "upstream_error");

  assert.equal(diagnosticsPayload.report.signals.upstreamError, true);
  assert.match(diagnosticsPayload.report.summary, /HTTP 400/);
  assert.match(diagnosticsPayload.report.outputPreview, /The server had an error while processing your request/);
  assert.ok(upstreamFinding);
  assert.match((upstreamFinding?.evidence ?? []).join(" "), /Retained raw response:/);
});

test("raw upstream HTTP 302 responses stay visible and count as errors", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-raw-upstream-302-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();

  const mockServer = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method?.toUpperCase() ?? "GET";

    if (method === "GET" && url.pathname === "/v1/models") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({
        object: "list",
        data: [
          {
            id: "mock-redirect-model",
            object: "model",
            created: 0,
            owned_by: "mock-openai-backend",
          },
        ],
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/v1/chat/completions") {
      await readRequestBody(request);
      response.writeHead(302, {
        location: "https://example.invalid/redirected",
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({
        error: {
          message: "Upstream redirected the request instead of answering it.",
          type: "redirect",
        },
      }));
      return;
    }

    response.writeHead(404, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({
      error: {
        message: `Unhandled mock route ${method} ${url.pathname}`,
        type: "invalid_request_error",
      },
    }));
  });
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    mockServer.once("error", reject);
    mockServer.listen(mockPort, "127.0.0.1", () => {
      mockServer.off("error", reject);
      resolve();
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-raw-redirect-upstream",
        name: "mock raw redirect upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-redirect-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "raw-upstream-302-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-raw-redirect-upstream");

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    redirect: "manual",
    body: JSON.stringify({
      model: "mock-redirect-model",
      stream: false,
      messages: [
        {
          role: "user",
          content: "Hello.",
        },
      ],
    }),
  });

  const requestId = response.headers.get("x-ai-proxy-request-id");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://example.invalid/redirected");
  assert.ok(requestId);

  const responsePayload = await response.json() as {
    error?: {
      message?: string;
      type?: string;
    };
  };
  assert.equal(responsePayload.error?.message, "Upstream redirected the request instead of answering it.");
  assert.equal(responsePayload.error?.type, "redirect");

  await waitForRecentRequest(baseUrl, (entry) => (
    entry.id === requestId && entry.outcome === "error"
  ));

  const stateResponse = await fetch(`${baseUrl}/api/llmproxy/admin/state`);
  assert.equal(stateResponse.status, 200);
  const statePayload = await stateResponse.json() as {
    recentRequests: Array<{
      id: string;
      outcome: string;
      statusCode?: number;
      error?: string;
    }>;
  };
  const recentEntry = statePayload.recentRequests.find((entry) => entry.id === requestId);

  assert.equal(recentEntry?.outcome, "error");
  assert.equal(recentEntry?.statusCode, 302);
  assert.equal(recentEntry?.error, "Upstream redirected the request instead of answering it.");
});

test("dashboard can cancel a live connection and retain the partial response in history", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-dashboard-cancel-"));
  const cleanup: Array<() => Promise<void>> = [];

  t.after(async () => {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  const mockPort = await getFreePort();
  const routerPort = await getFreePort();

  const mockServer = await startMockSlowStreamingBackend(mockPort);
  cleanup.push(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const config = createAiClientConfig({
    settings: {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 1000,
    },
    connections: [
      {
        id: "mock-dashboard-cancel-upstream",
        name: "mock dashboard cancel upstream",
        baseUrl: `http://127.0.0.1:${mockPort}`,
        enabled: true,
        maxConcurrency: 1,
        healthPath: "/v1/models",
        models: ["mock-live-model"],
      },
    ],
  });

  const router = await startRouter(config, path.join(tempDir, "dashboard-cancel-router.config.json"), { port: routerPort });
  cleanup.push(async () => {
    await router.server.stop();
    await router.loadBalancer.stop();
  });

  const baseUrl = `http://127.0.0.1:${routerPort}`;
  await waitForHealthyBackend(baseUrl, "mock-dashboard-cancel-upstream");

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "mock-live-model",
      stream: true,
      messages: [
        {
          role: "user",
          content: "Cancel this request from the dashboard.",
        },
      ],
    }),
  });

  assert.equal(response.status, 200);
  const reader = response.body?.getReader();
  assert.ok(reader);

  const firstChunk = await reader.read();
  assert.equal(firstChunk.done, false);
  const firstChunkText = new TextDecoder().decode(firstChunk.value);
  assert.match(firstChunkText, /Streaming /);

  const activeConnection = await waitForActiveConnection(baseUrl);
  const cancelResponse = await fetch(`${baseUrl}/api/llmproxy/admin/requests/${encodeURIComponent(activeConnection.id)}/cancel`, {
    method: "POST",
  });
  assert.equal(cancelResponse.status, 202);
  const cancelPayload = await cancelResponse.json() as {
    ok?: boolean;
    requestId?: string;
  };
  assert.equal(cancelPayload.ok, true);
  assert.equal(cancelPayload.requestId, activeConnection.id);

  try {
    await reader.read();
  } catch {
    // The dashboard-triggered abort can terminate the client stream abruptly.
  }

  const cancelledEntry = await waitForRecentRequest(baseUrl, (entry) => (
    entry.id === activeConnection.id && entry.outcome === "cancelled"
  ));

  const detailResponse = await fetch(`${baseUrl}/api/llmproxy/admin/requests/${encodeURIComponent(cancelledEntry.id)}`);
  assert.equal(detailResponse.status, 200);
  const detailPayload = await detailResponse.json() as {
    entry: {
      outcome: string;
    };
    responseBody?: {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };
  };

  assert.equal(detailPayload.entry.outcome, "cancelled");
  assert.match(detailPayload.responseBody?.choices?.[0]?.message?.content ?? "", /Streaming/);
});
