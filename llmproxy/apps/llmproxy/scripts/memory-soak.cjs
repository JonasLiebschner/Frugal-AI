const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const { createServer: createNetServer } = require("node:net");
const { tmpdir } = require("node:os");
const path = require("node:path");

const { loadTestRuntime } = require("./load-test-runtime.cjs");

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close(() => reject(new Error("Could not determine a free port.")));
        return;
      }

      const { port } = address;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function startMockBackend(port) {
  const server = createServer(async (request, response) => {
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
            id: "memory-soak-model",
            object: "model",
            created: 0,
            owned_by: "mock-memory-backend",
            metadata: Object.fromEntries(
              Array.from({ length: 200 }, (_, index) => [`field_${index}`, "m".repeat(256)]),
            ),
          },
        ],
      }));
      return;
    }

    if (method === "POST" && url.pathname === "/v1/chat/completions") {
      let body = "";
      for await (const chunk of request) {
        body += chunk.toString("utf8");
      }

      const payload = JSON.parse(body);
      const content = [
        "Large answer:",
        "A".repeat(100_000),
      ].join("\n");

      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({
        id: `chatcmpl-memory-${Math.random().toString(16).slice(2)}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: payload.model ?? "memory-soak-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content,
              tool_calls: Array.from({ length: 120 }, (_, index) => ({
                id: `call-${index}`,
                type: "function",
                function: {
                  name: `tool_${index}`,
                  arguments: JSON.stringify({
                    index,
                    payload: "x".repeat(2048),
                  }),
                },
              })),
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 400,
          total_tokens: 500,
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

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}

async function forceGc() {
  if (typeof global.gc !== "function") {
    return;
  }

  for (let index = 0; index < 3; index += 1) {
    global.gc();
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function heapUsedMb() {
  return Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 10) / 10;
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForCondition(check, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) {
      return;
    }

    await delay(20);
  }

  throw new Error(message);
}

async function main() {
  const { NitroTestServer, createLlmproxyTestRuntimeDependencies } = await loadTestRuntime();
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-memory-soak-"));
  const cleanup = [];

  try {
    const backendPort = await getFreePort();
    const proxyPort = await getFreePort();
    const mockServer = await startMockBackend(backendPort);
    cleanup.push(async () => {
      await new Promise((resolve, reject) => {
        mockServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    });

    const config = {
      requestTimeoutMs: 15_000,
      queueTimeoutMs: 2_000,
      healthCheckIntervalMs: 60_000,
      recentRequestLimit: 8,
      connections: [
        {
          id: "memory-upstream",
          name: "memory upstream",
          baseUrl: `http://127.0.0.1:${backendPort}`,
          enabled: true,
          maxConcurrency: 4,
          healthPath: "/v1/models",
          models: ["memory-soak-model"],
        },
      ],
    };

    const configPath = path.join(tempDir, "llmproxy-memory-soak.config.json");
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    const dependencies = await createLlmproxyTestRuntimeDependencies(configPath);
    const { loadBalancer } = dependencies;
    cleanup.push(async () => {
      await loadBalancer.stop();
    });

    const server = new NitroTestServer(dependencies, {
      port: proxyPort,
    });
    await server.start();
    cleanup.push(async () => {
      await server.stop();
    });

    const baseUrl = `http://127.0.0.1:${proxyPort}`;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/llmproxy/admin/state`);
      const payload = await response.json();
      if (payload.backends?.[0]?.healthy) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const requestPayload = {
      model: "memory-soak-model",
      stream: false,
      messages: Array.from({ length: 180 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `message-${index}-` + "q".repeat(4096),
      })),
      metadata: Object.fromEntries(
        Array.from({ length: 180 }, (_, index) => [`field_${index}`, "z".repeat(256)]),
      ),
    };

    await forceGc();
    const baselineHeapMb = heapUsedMb();

    const requestCount = 80;
    const concurrency = 8;
    let nextIndex = 0;

    async function worker() {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= requestCount) {
          return;
        }

        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(requestPayload),
        });
        assert.equal(response.status, 200);
        await response.arrayBuffer();
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    await forceGc();

    const finalHeapMb = heapUsedMb();
    const snapshot = loadBalancer.getSnapshot();
    const internals = loadBalancer;
    const recentRequestDetails = internals.recentRequestDetails;
    const diagnosedRequestIds = internals.diagnosedRequestIds;
    const retainedBytes = Array.from(recentRequestDetails.values()).reduce((sum, detail) => (
      sum + Buffer.byteLength(JSON.stringify(detail))
    ), 0);
    const sampleRetainedDetail = Array.from(recentRequestDetails.values())[0];

    assert.equal(snapshot.activeConnections.length, 0);
    assert.equal(snapshot.recentRequests.length, config.recentRequestLimit);
    assert.equal(recentRequestDetails.size, config.recentRequestLimit);
    assert.equal(diagnosedRequestIds.size, config.recentRequestLimit);
    assert.ok(sampleRetainedDetail);
    assert.equal(sampleRetainedDetail.requestBody.messages.length, requestPayload.messages.length);
    assert.equal(sampleRetainedDetail.requestBody.messages[179].content, requestPayload.messages[179].content);
    assert.equal(sampleRetainedDetail.requestBody.metadata.field_179, "z".repeat(256));
    assert.equal(sampleRetainedDetail.responseBody, undefined);
    assert.equal(
      retainedBytes,
      config.recentRequestLimit * Buffer.byteLength(JSON.stringify(sampleRetainedDetail)),
    );
    assert.ok(finalHeapMb <= baselineHeapMb + 35);

    const sseConnections = await Promise.all(
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

    await waitForCondition(
      () => server.getDashboardSseClientCount() === sseConnections.length,
      1_000,
      `Timed out waiting for ${sseConnections.length} SSE clients. Currently connected: ${server.getDashboardSseClientCount()}.`,
    );

    await Promise.allSettled(sseConnections.map(async ({ controller, reader }) => {
      controller.abort();
      if (reader) {
        await reader.cancel().catch(() => undefined);
      }
    }));

    await waitForCondition(
      () => server.getDashboardSseClientCount() === 0,
      1_000,
      `Timed out waiting for SSE clients to disconnect. Remaining clients: ${server.getDashboardSseClientCount()}.`,
    );

    await forceGc();
    const postSseHeapMb = heapUsedMb();
    const peakHeapMb = Math.max(finalHeapMb, postSseHeapMb);
    assert.ok(peakHeapMb <= baselineHeapMb + 40);

    process.stdout.write(
      JSON.stringify({
        ok: true,
        baselineHeapMb,
        finalHeapMb,
        postSseHeapMb,
        peakHeapMb,
        heapGrowthMb: Math.round((finalHeapMb - baselineHeapMb) * 10) / 10,
        retainedBytes,
        recentRequests: snapshot.recentRequests.length,
        retainedDetails: recentRequestDetails.size,
        sseClientsAfterChurn: server.getDashboardSseClientCount(),
      }, null, 2) + "\n",
    );
  } finally {
    for (const entry of cleanup.reverse()) {
      await entry();
    }

    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
