import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAiClientConfig } from "../../shared/test/ai-client-config";
import { delay, readRequestBody } from "./test-helpers";
import {
  getFreePort,
  startRouter,
  waitForHealthyBackend,
  waitForRecentRequest,
} from "./router-test-helpers";

async function startMockDiagnosticsBackend(port: number): Promise<Server> {
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
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
            id: "diagnostics-model",
            object: "model",
            created: 0,
            owned_by: "mock-diagnostics-backend",
            max_completion_tokens: 256,
          },
        ],
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/v1/chat/completions") {
      await readRequestBody(request);
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      });

      const chunks = [
        {
          id: "chatcmpl-diagnostics",
          object: "chat.completion.chunk",
          created: 1710000000,
          model: "diagnostics-model",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: "This answer repeats itself. ",
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-diagnostics",
          object: "chat.completion.chunk",
          created: 1710000000,
          model: "diagnostics-model",
          choices: [
            {
              index: 0,
              delta: {
                content: "This answer repeats itself. This answer repeats itself. ",
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-diagnostics",
          object: "chat.completion.chunk",
          created: 1710000000,
          model: "diagnostics-model",
          choices: [
            {
              index: 0,
              delta: {
                content: "This answer repeats itself.",
              },
              finish_reason: "length",
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 64,
            total_tokens: 76,
          },
        },
      ];

      for (const chunk of chunks) {
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      response.write("data: [DONE]\n\n");
      response.end();
      return;
    }

    response.writeHead(404);
    response.end();
  }).listen(port, "127.0.0.1");
}

interface McpTestClient {
  headers: Record<string, string>;
  request: (payload: Record<string, unknown>) => Promise<Response>;
  close: () => Promise<Response>;
}

function buildMcpHeaders(
  sessionId?: string,
  protocolVersion = "2025-11-25",
): Record<string, string> {
  return {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    ...(sessionId ? {
      "mcp-session-id": sessionId,
      "mcp-protocol-version": protocolVersion,
    } : {}),
  };
}

async function createMcpClient(baseUrl: string): Promise<McpTestClient> {
  const initializeResponse = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: buildMcpHeaders(),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "initialize",
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        clientInfo: {
          name: "llmproxy-test-client",
          version: "1.0.0",
        },
        capabilities: {},
      },
    }),
  });
  assert.equal(initializeResponse.status, 200);

  const sessionId = initializeResponse.headers.get("mcp-session-id");
  const protocolVersion = initializeResponse.headers.get("mcp-protocol-version");
  assert.equal(protocolVersion, "2025-11-25");
  assert.ok(sessionId);

  const initializePayload = await initializeResponse.json() as {
    result?: {
      protocolVersion?: string;
    };
  };
  assert.equal(initializePayload.result?.protocolVersion, "2025-11-25");

  const headers = buildMcpHeaders(sessionId ?? undefined, protocolVersion ?? "2025-11-25");
  const initializedResponse = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });
  assert.equal(initializedResponse.status, 202);

  return {
    headers,
    request: async (payload) => await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }),
    close: async () => await fetch(`${baseUrl}/mcp`, {
      method: "DELETE",
      headers,
    }),
  };
}

test("MCP tools expose heuristic request reports", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-diagnostics-"));
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const backendPort = await getFreePort();
    const routerPort = await getFreePort();

    const backend = await startMockDiagnosticsBackend(backendPort);
    cleanup.push(async () => {
      await new Promise<void>((resolve, reject) => {
        backend.close((error) => {
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
        requestTimeoutMs: 10000,
        queueTimeoutMs: 2000,
        healthCheckIntervalMs: 60000,
        recentRequestLimit: 1000,
      },
      connections: [
        {
          id: "mock-diagnostics-upstream",
          name: "mock diagnostics upstream",
          baseUrl: `http://127.0.0.1:${backendPort}`,
          enabled: true,
          maxConcurrency: 1,
          healthPath: "/v1/models",
          models: ["diagnostics-model"],
        },
      ],
    });

    const router = await startRouter(config, path.join(tempDir, "diagnostics-router.config.json"), { port: routerPort });
    cleanup.push(async () => {
      await router.server.stop();
      await router.loadBalancer.stop();
    });

    const baseUrl = `http://127.0.0.1:${routerPort}`;
    await waitForHealthyBackend(baseUrl, "mock-diagnostics-upstream");
    const mcpClient = await createMcpClient(baseUrl);
    cleanup.push(async () => {
      await mcpClient.close();
    });

    const chatResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "diagnostics-model",
        stream: false,
        max_tokens: 64,
        messages: [
          {
            role: "user",
            content: "Explain something briefly.",
          },
        ],
      }),
    });
    assert.equal(chatResponse.status, 200);

    const recentRequest = await waitForRecentRequest(baseUrl, (entry) => entry.outcome === "success");

    const reportResponse = await fetch(`${baseUrl}/api/llmproxy/admin/diagnostics/requests/${encodeURIComponent(recentRequest.id)}`);
    assert.equal(reportResponse.status, 200);
    const reportPayload = await reportResponse.json() as {
      report: {
        signals: {
          maxTokensReached: boolean;
          repetitionDetected: boolean;
        };
      };
    };

    assert.equal(reportPayload.report.signals.maxTokensReached, true);
    assert.equal(reportPayload.report.signals.repetitionDetected, true);

    const mcpResponse = await mcpClient.request({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "diagnose_request",
          arguments: {
            request_id: recentRequest.id,
          },
        },
    });
    assert.equal(mcpResponse.status, 200);
    const mcpPayload = await mcpResponse.json() as {
      result?: {
        structuredContent?: {
          signals?: {
            maxTokensReached?: boolean;
            repetitionDetected?: boolean;
          };
        };
      };
      error?: {
        message: string;
      };
    };

    assert.equal(mcpPayload.error, undefined);
    assert.equal(mcpPayload.result?.structuredContent?.signals?.maxTokensReached, true);
    assert.equal(mcpPayload.result?.structuredContent?.signals?.repetitionDetected, true);
  } finally {
    while (cleanup.length > 0) {
      const task = cleanup.pop();
      if (task) {
        await task();
      }
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});

test("MCP tools expose models and chat completions", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-diagnostics-proxy-"));
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const backendPort = await getFreePort();
    const routerPort = await getFreePort();

    const backend = await startMockDiagnosticsBackend(backendPort);
    cleanup.push(async () => {
      await new Promise<void>((resolve, reject) => {
        backend.close((error) => {
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
        requestTimeoutMs: 10000,
        queueTimeoutMs: 2000,
        healthCheckIntervalMs: 60000,
        recentRequestLimit: 1000,
      },
      connections: [
        {
          id: "mock-diagnostics-upstream",
          name: "mock diagnostics upstream",
          baseUrl: `http://127.0.0.1:${backendPort}`,
          enabled: true,
          maxConcurrency: 1,
          healthPath: "/v1/models",
          models: ["diagnostics-model"],
        },
      ],
    });

    const router = await startRouter(config, path.join(tempDir, "diagnostics-router-proxy.config.json"), { port: routerPort });
    cleanup.push(async () => {
      await router.server.stop();
      await router.loadBalancer.stop();
    });

    const baseUrl = `http://127.0.0.1:${routerPort}`;
    await waitForHealthyBackend(baseUrl, "mock-diagnostics-upstream");
    const mcpClient = await createMcpClient(baseUrl);
    cleanup.push(async () => {
      await mcpClient.close();
    });

    const modelsResponse = await mcpClient.request({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "list_models",
          arguments: {},
        },
    });
    assert.equal(modelsResponse.status, 200);
    const modelsPayload = await modelsResponse.json() as {
      result?: {
        structuredContent?: {
          object: string;
          data: Array<{
            id: string;
            object: string;
            created: number;
            owned_by: string;
          }>;
        };
      };
      error?: {
        message?: string;
      };
    };

    assert.equal(modelsPayload.error, undefined);
    assert.equal(modelsPayload.result?.structuredContent?.object, "list");
    assert.deepEqual(modelsPayload.result?.structuredContent?.data.map((entry) => entry.id), ["diagnostics-model"]);
    assert.equal(modelsPayload.result?.structuredContent?.data[0]?.object, "model");
    assert.equal(modelsPayload.result?.structuredContent?.data[0]?.created, 0);
    assert.equal(modelsPayload.result?.structuredContent?.data[0]?.owned_by, "");
    assert.equal(
      Object.prototype.hasOwnProperty.call(modelsPayload.result?.structuredContent?.data[0] ?? {}, "metadata"),
      false,
    );

    const chatResponse = await mcpClient.request({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "chat_with_model",
          arguments: {
            model: "diagnostics-model",
            max_tokens: 64,
            messages: [
              {
                role: "user",
                content: "Explain something briefly.",
              },
            ],
          },
        },
    });
    assert.equal(chatResponse.status, 200);
    const chatPayload = await chatResponse.json() as {
      result?: {
        structuredContent?: {
          object?: string;
          model?: string;
          choices?: Array<{
            finish_reason?: string | null;
          }>;
        };
      };
      error?: {
        message?: string;
      };
    };

    assert.equal(chatPayload.error, undefined);
    assert.equal(chatPayload.result?.structuredContent?.object, "chat.completion");
    assert.equal(chatPayload.result?.structuredContent?.model, "diagnostics-model");
    assert.equal(chatPayload.result?.structuredContent?.choices?.[0]?.finish_reason, "length");
  } finally {
    while (cleanup.length > 0) {
      const task = cleanup.pop();
      if (task) {
        await task();
      }
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});

test("MCP chat_with_model tool rejects explicit stream arguments", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-mcp-chat-stream-"));
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const backendPort = await getFreePort();
    const routerPort = await getFreePort();

    const backend = await startMockDiagnosticsBackend(backendPort);
    cleanup.push(async () => {
      await new Promise<void>((resolve, reject) => {
        backend.close((error) => {
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
        requestTimeoutMs: 10000,
        queueTimeoutMs: 2000,
        healthCheckIntervalMs: 60000,
        recentRequestLimit: 1000,
      },
      connections: [
        {
          id: "mock-diagnostics-upstream",
          name: "mock diagnostics upstream",
          baseUrl: `http://127.0.0.1:${backendPort}`,
          enabled: true,
          maxConcurrency: 1,
          healthPath: "/v1/models",
          models: ["diagnostics-model"],
        },
      ],
    });

    const router = await startRouter(config, path.join(tempDir, "mcp-chat-stream-router.config.json"), { port: routerPort });
    cleanup.push(async () => {
      await router.server.stop();
      await router.loadBalancer.stop();
    });

    const baseUrl = `http://127.0.0.1:${routerPort}`;
    await waitForHealthyBackend(baseUrl, "mock-diagnostics-upstream");
    const mcpClient = await createMcpClient(baseUrl);
    cleanup.push(async () => {
      await mcpClient.close();
    });

    const response = await mcpClient.request({
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: {
          name: "chat_with_model",
          arguments: {
            model: "diagnostics-model",
            stream: true,
            messages: [
              {
                role: "user",
                content: "Hello",
              },
            ],
          },
        },
    });

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      result?: {
        isError?: boolean;
        structuredContent?: {
          error?: {
            message?: string;
            details?: string[];
          };
        };
      };
      error?: {
        message?: string;
      };
    };

    assert.equal(payload.error, undefined);
    assert.equal(payload.result?.isError, true);
    assert.equal(payload.result?.structuredContent?.error?.message, 'The tool "chat_with_model" received invalid arguments.');
    assert.ok(
      payload.result?.structuredContent?.error?.details?.some((detail) => detail.includes('unsupported field "stream"')),
    );
  } finally {
    while (cleanup.length > 0) {
      const task = cleanup.pop();
      if (task) {
        await task();
      }
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});

test("MCP chat_with_model tool accepts valid JSON string arguments", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-mcp-chat-json-string-"));
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const backendPort = await getFreePort();
    const routerPort = await getFreePort();

    const backend = await startMockDiagnosticsBackend(backendPort);
    cleanup.push(async () => {
      await new Promise<void>((resolve, reject) => {
        backend.close((error) => {
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
        requestTimeoutMs: 10000,
        queueTimeoutMs: 2000,
        healthCheckIntervalMs: 60000,
        recentRequestLimit: 1000,
      },
      connections: [
        {
          id: "mock-diagnostics-upstream",
          name: "mock diagnostics upstream",
          baseUrl: `http://127.0.0.1:${backendPort}`,
          enabled: true,
          maxConcurrency: 1,
          healthPath: "/v1/models",
          models: ["diagnostics-model"],
        },
      ],
    });

    const router = await startRouter(config, path.join(tempDir, "mcp-chat-json-string-router.config.json"), { port: routerPort });
    cleanup.push(async () => {
      await router.server.stop();
      await router.loadBalancer.stop();
    });

    const baseUrl = `http://127.0.0.1:${routerPort}`;
    await waitForHealthyBackend(baseUrl, "mock-diagnostics-upstream");
    const mcpClient = await createMcpClient(baseUrl);
    cleanup.push(async () => {
      await mcpClient.close();
    });

    const response = await mcpClient.request({
        jsonrpc: "2.0",
        id: 9.5,
        method: "tools/call",
        params: {
          name: "chat_with_model",
          arguments: JSON.stringify({
            model: "diagnostics-model",
            messages: [
              {
                role: "user",
                content: "Hello",
              },
            ],
          }),
        },
    });

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      result?: {
        isError?: boolean;
        structuredContent?: {
          object?: string;
          model?: string;
        };
      };
      error?: {
        message?: string;
      };
    };

    assert.equal(payload.error, undefined);
    assert.equal(payload.result?.isError, undefined);
    assert.equal(payload.result?.structuredContent?.object, "chat.completion");
    assert.equal(payload.result?.structuredContent?.model, "diagnostics-model");
  } finally {
    while (cleanup.length > 0) {
      const task = cleanup.pop();
      if (task) {
        await task();
      }
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});

test("MCP chat_with_model tool rejects unsupported extra arguments", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-mcp-chat-extra-"));
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const backendPort = await getFreePort();
    const routerPort = await getFreePort();

    const backend = await startMockDiagnosticsBackend(backendPort);
    cleanup.push(async () => {
      await new Promise<void>((resolve, reject) => {
        backend.close((error) => {
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
        requestTimeoutMs: 10000,
        queueTimeoutMs: 2000,
        healthCheckIntervalMs: 60000,
        recentRequestLimit: 1000,
      },
      connections: [
        {
          id: "mock-diagnostics-upstream",
          name: "mock diagnostics upstream",
          baseUrl: `http://127.0.0.1:${backendPort}`,
          enabled: true,
          maxConcurrency: 1,
          healthPath: "/v1/models",
          models: ["diagnostics-model"],
        },
      ],
    });

    const router = await startRouter(config, path.join(tempDir, "mcp-chat-extra-router.config.json"), { port: routerPort });
    cleanup.push(async () => {
      await router.server.stop();
      await router.loadBalancer.stop();
    });

    const baseUrl = `http://127.0.0.1:${routerPort}`;
    await waitForHealthyBackend(baseUrl, "mock-diagnostics-upstream");
    const mcpClient = await createMcpClient(baseUrl);
    cleanup.push(async () => {
      await mcpClient.close();
    });

    const response = await mcpClient.request({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: {
          name: "chat_with_model",
          arguments: {
            model: "diagnostics-model",
            messages: [
              {
                role: "user",
                content: "Hello",
              },
            ],
            extra_flag: true,
          },
        },
    });

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      result?: {
        isError?: boolean;
        structuredContent?: {
          error?: {
            message?: string;
            details?: string[];
          };
        };
      };
      error?: {
        message?: string;
      };
    };

    assert.equal(payload.error, undefined);
    assert.equal(payload.result?.isError, true);
    assert.equal(payload.result?.structuredContent?.error?.message, 'The tool "chat_with_model" received invalid arguments.');
    assert.ok(
      payload.result?.structuredContent?.error?.details?.some((detail) => detail.includes('unsupported field "extra_flag"')),
    );
  } finally {
    while (cleanup.length > 0) {
      const task = cleanup.pop();
      if (task) {
        await task();
      }
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});

test("MCP chat_with_model tool requires exactly one target model", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-mcp-chat-model-"));
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const backendPort = await getFreePort();
    const routerPort = await getFreePort();

    const backend = await startMockDiagnosticsBackend(backendPort);
    cleanup.push(async () => {
      await new Promise<void>((resolve, reject) => {
        backend.close((error) => {
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
        requestTimeoutMs: 10000,
        queueTimeoutMs: 2000,
        healthCheckIntervalMs: 60000,
        recentRequestLimit: 1000,
      },
      connections: [
        {
          id: "mock-diagnostics-upstream",
          name: "mock diagnostics upstream",
          baseUrl: `http://127.0.0.1:${backendPort}`,
          enabled: true,
          maxConcurrency: 1,
          healthPath: "/v1/models",
          models: ["diagnostics-model"],
        },
      ],
    });

    const router = await startRouter(config, path.join(tempDir, "mcp-chat-model-router.config.json"), { port: routerPort });
    cleanup.push(async () => {
      await router.server.stop();
      await router.loadBalancer.stop();
    });

    const baseUrl = `http://127.0.0.1:${routerPort}`;
    await waitForHealthyBackend(baseUrl, "mock-diagnostics-upstream");
    const mcpClient = await createMcpClient(baseUrl);
    cleanup.push(async () => {
      await mcpClient.close();
    });

    const response = await mcpClient.request({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: {
          name: "chat_with_model",
          arguments: {
            messages: [
              {
                role: "user",
                content: "Hello",
              },
            ],
          },
        },
    });

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      result?: {
        isError?: boolean;
        structuredContent?: {
          error?: {
            message?: string;
            details?: string[];
          };
        };
      };
      error?: {
        message?: string;
      };
    };

    assert.equal(payload.error, undefined);
    assert.equal(payload.result?.isError, true);
    assert.equal(payload.result?.structuredContent?.error?.message, 'The tool "chat_with_model" received invalid arguments.');
    assert.ok(
      payload.result?.structuredContent?.error?.details?.some((detail) => detail.includes("arguments.model is required")),
    );
  } finally {
    while (cleanup.length > 0) {
      const task = cleanup.pop();
      if (task) {
        await task();
      }
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});

test("MCP chat_with_model tool returns recovery instructions for concatenated JSON argument strings", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-mcp-chat-concatenated-"));
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const backendPort = await getFreePort();
    const routerPort = await getFreePort();

    const backend = await startMockDiagnosticsBackend(backendPort);
    cleanup.push(async () => {
      await new Promise<void>((resolve, reject) => {
        backend.close((error) => {
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
        requestTimeoutMs: 10000,
        queueTimeoutMs: 2000,
        healthCheckIntervalMs: 60000,
        recentRequestLimit: 1000,
      },
      connections: [
        {
          id: "mock-diagnostics-upstream",
          name: "mock diagnostics upstream",
          baseUrl: `http://127.0.0.1:${backendPort}`,
          enabled: true,
          maxConcurrency: 1,
          healthPath: "/v1/models",
          models: ["diagnostics-model"],
        },
      ],
    });

    const router = await startRouter(config, path.join(tempDir, "mcp-chat-concatenated-router.config.json"), { port: routerPort });
    cleanup.push(async () => {
      await router.server.stop();
      await router.loadBalancer.stop();
    });

    const baseUrl = `http://127.0.0.1:${routerPort}`;
    await waitForHealthyBackend(baseUrl, "mock-diagnostics-upstream");
    const mcpClient = await createMcpClient(baseUrl);
    cleanup.push(async () => {
      await mcpClient.close();
    });

    const response = await mcpClient.request({
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: {
          name: "chat_with_model",
          arguments:
            '{"model":"qwen3:30b-a3b-thinking-2507-q4_K_M","messages":[{"content":"kannst du bilder lesen?","role":"user"}]}{"model":"qwen3.5-35b-a3b","messages":[{"content":"kannst du bilder lesen?","role":"user"}]}',
        },
    });

    assert.equal(response.status, 200);
    const payload = await response.json() as {
      result?: {
        isError?: boolean;
        structuredContent?: {
          error?: {
            message?: string;
            instructions?: string[];
          };
        };
      };
      error?: {
        message?: string;
      };
    };

    assert.equal(payload.error, undefined);
    assert.equal(payload.result?.isError, true);
    assert.equal(payload.result?.structuredContent?.error?.message, 'The tool "chat_with_model" received invalid arguments.');
    assert.ok(
      payload.result?.structuredContent?.error?.instructions?.some((instruction) => instruction.includes("Do not concatenate multiple JSON objects")),
    );
  } finally {
    while (cleanup.length > 0) {
      const task = cleanup.pop();
      if (task) {
        await task();
      }
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});

test("MCP manifest exposes separate AI proxy tool and AI agents prompt services", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-mcp-manifest-"));
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const backendPort = await getFreePort();
    const routerPort = await getFreePort();

    const backend = await startMockDiagnosticsBackend(backendPort);
    cleanup.push(async () => {
      await new Promise<void>((resolve, reject) => {
        backend.close((error) => {
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
        requestTimeoutMs: 10000,
        queueTimeoutMs: 2000,
        healthCheckIntervalMs: 60000,
        recentRequestLimit: 1000,
      },
      connections: [
        {
          id: "mock-diagnostics-upstream",
          name: "mock diagnostics upstream",
          baseUrl: `http://127.0.0.1:${backendPort}`,
          enabled: true,
          maxConcurrency: 1,
          healthPath: "/v1/models",
          models: ["diagnostics-model"],
        },
      ],
    });

    const router = await startRouter(config, path.join(tempDir, "mcp-manifest-router.config.json"), { port: routerPort });
    cleanup.push(async () => {
      await router.server.stop();
      await router.loadBalancer.stop();
    });

    const baseUrl = `http://127.0.0.1:${routerPort}`;
    await waitForHealthyBackend(baseUrl, "mock-diagnostics-upstream");
    const mcpClient = await createMcpClient(baseUrl);
    cleanup.push(async () => {
      await mcpClient.close();
    });

    const manifestResponse = await mcpClient.request({
        jsonrpc: "2.0",
        id: 1,
        method: "services/list",
    });
    assert.equal(manifestResponse.status, 200);

    const manifestPayload = await manifestResponse.json() as {
      result?: {
        endpoint?: string;
        services?: Array<{
          id?: string;
          title?: string;
          tools?: Array<{
            name?: string;
            title?: string;
            description?: string;
            inputSchema?: {
              description?: string;
              additionalProperties?: boolean;
              properties?: Record<string, unknown>;
              examples?: unknown[];
            };
          }>;
          prompts?: Array<{ name?: string }>;
        }>;
      };
      error?: {
        message?: string;
      };
    };

    assert.equal(manifestPayload.error, undefined);
    assert.equal(manifestPayload.result?.endpoint, "/mcp");
    assert.equal(manifestPayload.result?.services?.length, 2);
    const toolService = manifestPayload.result?.services?.find((service) => service.id === "ai-proxy");
    const promptService = manifestPayload.result?.services?.find((service) => service.id === "ai-proxy-diagnostics");
    assert.equal(toolService?.title, "AI proxy tools");
    assert.equal(promptService?.title, "AI proxy diagnostics prompts");
    assert.deepEqual(
      toolService?.tools?.map((tool) => tool.name),
      ["list_models", "chat_with_model", "list_requests", "get_request_detail", "diagnose_request"],
    );
    const chatTool = toolService?.tools?.find((tool) => tool.name === "chat_with_model");
    assert.equal(Boolean(chatTool), true);
    assert.equal(chatTool?.title, "Chat with one model");
    assert.match(chatTool?.description ?? "", /exactly one registered ai proxy model/i);
    assert.match(chatTool?.description ?? "", /never concatenate multiple json objects/i);
    assert.match(chatTool?.description ?? "", /multiple tool_calls entries/i);
    assert.equal(chatTool?.inputSchema?.additionalProperties, false);
    assert.match(String(chatTool?.inputSchema?.description ?? ""), /exactly one json object/i);
    assert.match(String(chatTool?.inputSchema?.description ?? ""), /never concatenate multiple json objects/i);
    assert.match(String(chatTool?.inputSchema?.description ?? ""), /multiple separate tool_calls entries/i);
    assert.equal(
      Object.prototype.hasOwnProperty.call(chatTool?.inputSchema?.properties ?? {}, "stream"),
      false,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(chatTool?.inputSchema?.properties ?? {}, "messages"),
      true,
    );
    assert.deepEqual(
      (chatTool?.inputSchema as { required?: unknown[] } | undefined)?.required,
      ["model", "messages"],
    );
    const modelSchema = chatTool?.inputSchema?.properties?.model as { description?: string } | undefined;
    assert.match(String(modelSchema?.description ?? ""), /exactly one target model/i);
    assert.match(String(modelSchema?.description ?? ""), /multiple tool_calls entries/i);
    const messagesSchema = chatTool?.inputSchema?.properties?.messages as {
      type?: string;
      description?: string;
      items?: {
        oneOf?: Array<{
          properties?: Record<string, unknown>;
        }>;
      };
    } | undefined;
    assert.equal(messagesSchema?.type, "array");
    assert.match(String(messagesSchema?.description ?? ""), /one tool_calls entry per target model/i);
    assert.ok(Array.isArray(messagesSchema?.items?.oneOf));
    const messageRoleEnums = (messagesSchema?.items?.oneOf ?? []).map((schema) => {
      const roleProperty = schema.properties?.role as { enum?: unknown[] } | undefined;
      return Array.isArray(roleProperty?.enum)
        ? roleProperty.enum[0] as string | undefined
        : undefined;
    });
    assert.deepEqual(messageRoleEnums, ["system", "developer", "user", "assistant", "tool"]);
    assert.deepEqual(
      toolService?.prompts?.map((prompt) => prompt.name) ?? [],
      [],
    );
    assert.deepEqual(
      promptService?.tools?.map((tool) => tool.name) ?? [],
      [],
    );
    assert.deepEqual(
      promptService?.prompts?.map((prompt) => prompt.name),
      ["diagnose-request", "troubleshoot-max-tokens", "troubleshoot-repetition", "troubleshoot-routing"],
    );
  } finally {
    while (cleanup.length > 0) {
      const task = cleanup.pop();
      if (task) {
        await task();
      }
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});

test("MCP endpoint returns 503 when disabled in MCP runtime config", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-diagnostics-disabled-"));
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const backendPort = await getFreePort();
    const routerPort = await getFreePort();

    const backend = await startMockDiagnosticsBackend(backendPort);
    cleanup.push(async () => {
      await new Promise<void>((resolve, reject) => {
        backend.close((error) => {
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
        requestTimeoutMs: 10000,
        queueTimeoutMs: 2000,
        healthCheckIntervalMs: 60000,
        recentRequestLimit: 1000,
      },
      connections: [
        {
          id: "mock-diagnostics-upstream",
          name: "mock diagnostics upstream",
          baseUrl: `http://127.0.0.1:${backendPort}`,
          enabled: true,
          maxConcurrency: 1,
          healthPath: "/v1/models",
          models: ["diagnostics-model"],
        },
      ],
    });

    const router = await startRouter(
      config,
      path.join(tempDir, "diagnostics-router-disabled.config.json"),
      { enableMcp: false, port: routerPort },
    );
    cleanup.push(async () => {
      await router.server.stop();
      await router.loadBalancer.stop();
    });

    const baseUrl = `http://127.0.0.1:${routerPort}`;
    await waitForHealthyBackend(baseUrl, "mock-diagnostics-upstream");

    const mcpResponse = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      }),
    });

    assert.equal(mcpResponse.status, 503);
    const payload = await mcpResponse.json() as {
      error?: {
        message?: string;
      };
    };
    assert.equal(payload.error?.message, "MCP server is disabled.");

    const modelsResponse = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "list_models",
          arguments: {},
        },
      }),
    });
    assert.equal(modelsResponse.status, 503);
    const modelsPayload = await modelsResponse.json() as {
      error?: {
        message?: string;
      };
    };
    assert.equal(modelsPayload.error?.message, "MCP server is disabled.");
  } finally {
    while (cleanup.length > 0) {
      const task = cleanup.pop();
      if (task) {
        await task();
      }
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});

test("removed diagnostics MCP routes are not exposed anymore", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-removed-mcp-"));
  const cleanup: Array<() => Promise<void>> = [];

  try {
    const backendPort = await getFreePort();
    const routerPort = await getFreePort();

    const backend = await startMockDiagnosticsBackend(backendPort);
    cleanup.push(async () => {
      await new Promise<void>((resolve, reject) => {
        backend.close((error) => {
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
        requestTimeoutMs: 10000,
        queueTimeoutMs: 2000,
        healthCheckIntervalMs: 60000,
        recentRequestLimit: 1000,
      },
      connections: [
        {
          id: "mock-diagnostics-upstream",
          name: "mock diagnostics upstream",
          baseUrl: `http://127.0.0.1:${backendPort}`,
          enabled: true,
          maxConcurrency: 1,
          healthPath: "/v1/models",
          models: ["diagnostics-model"],
        },
      ],
    });

    const router = await startRouter(config, path.join(tempDir, "removed-mcp-router.config.json"), { port: routerPort });
    cleanup.push(async () => {
      await router.server.stop();
      await router.loadBalancer.stop();
    });

    const baseUrl = `http://127.0.0.1:${routerPort}`;
    await waitForHealthyBackend(baseUrl, "mock-diagnostics-upstream");

    const removedMcpResponse = await fetch(`${baseUrl}/api/diagnostics/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      }),
    });
    assert.equal(removedMcpResponse.status, 404);

    const removedModelsResponse = await fetch(`${baseUrl}/api/diagnostics/mcp/v1/models`);
    assert.equal(removedModelsResponse.status, 404);
  } finally {
    while (cleanup.length > 0) {
      const task = cleanup.pop();
      if (task) {
        await task();
      }
    }

    await rm(tempDir, { recursive: true, force: true });
  }
});
