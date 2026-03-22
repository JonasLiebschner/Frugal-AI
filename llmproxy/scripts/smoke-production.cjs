const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const {
  createMcpSession,
  expectErrorJson,
  expectFileJson,
  expectHtml,
  expectJson,
  expectSse,
  getFreePort,
  sendJson,
  sendMcpRequest,
  toDebugOutput,
  waitForServer,
} = require("./smoke-production-helpers.cjs");

async function main() {
  const projectRoot = process.cwd();
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "llmproxy-smoke-"));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverEntry = path.join(projectRoot, ".output", "server", "index.mjs");
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    DATA_DIR: dataDir,
  };

  const server = spawn(process.execPath, [serverEntry], {
    cwd: dataDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  server.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const stdoutRef = () => stdout;
  const stderrRef = () => stderr;

  try {
    await waitForServer(baseUrl, stdoutRef, stderrRef);

      await expectHtml(baseUrl, "/", stdoutRef, stderrRef);
      await expectHtml(baseUrl, "/dashboard", stdoutRef, stderrRef);
      await expectHtml(baseUrl, "/dashboard/config", stdoutRef, stderrRef);
      await expectHtml(baseUrl, "/dashboard/config/connections", stdoutRef, stderrRef);
      await expectHtml(baseUrl, "/dashboard/config/openai", stdoutRef, stderrRef);
      await expectHtml(baseUrl, "/dashboard/config/mcp", stdoutRef, stderrRef);
      await expectHtml(baseUrl, "/dashboard/connections", stdoutRef, stderrRef);
      await expectHtml(baseUrl, "/dashboard/diagnostics", stdoutRef, stderrRef);

    await expectJson(baseUrl, "/healthz", (payload) => {
      if (typeof payload?.status !== "string") {
        throw new Error("/healthz did not return a status string.");
      }

      if (!["ok", "degraded"].includes(payload.status)) {
        throw new Error(`/healthz returned the unexpected status "${payload.status}".`);
      }
    }, stdoutRef, stderrRef);

    const initialConnections = await expectJson(baseUrl, "/api/llmproxy/admin/connections", (payload) => {
      if (!Array.isArray(payload?.data)) {
        throw new Error("Admin connections payload is missing its data array.");
      }

      if (!payload?.settings || typeof payload.settings !== "object") {
        throw new Error("Admin connections payload is missing the AI client settings.");
      }
    }, stdoutRef, stderrRef);
    if (initialConnections.data.length !== 0) {
      throw new Error("Fresh production smoke DATA_DIR should start without configured connections.");
    }

    await expectJson(baseUrl, "/api/llmproxy/admin/state", (payload) => {
      if (!Array.isArray(payload?.backends)) {
        throw new Error("Admin state payload is missing its backend snapshot array.");
      }

      if (!payload?.totals || typeof payload.totals !== "object") {
        throw new Error("Admin state payload is missing totals.");
      }
    }, stdoutRef, stderrRef);

    await expectJson(baseUrl, "/api/llmproxy/admin/mcp-client/servers", (payload) => {
      if (!Array.isArray(payload?.data)) {
        throw new Error("Admin MCP client payload is missing its data array.");
      }
    }, stdoutRef, stderrRef);

    await expectJson(baseUrl, "/api/llmproxy/admin/ai-request-middleware/middlewares", (payload) => {
      if (!Array.isArray(payload?.data)) {
        throw new Error("Admin AI request middleware payload is missing its data array.");
      }
    }, stdoutRef, stderrRef);

    await expectJson(baseUrl, "/api/llmproxy/admin/otel", (payload) => {
      if (!payload?.config || typeof payload.config !== "object") {
        throw new Error("Admin OTel payload is missing its config object.");
      }

      if (payload.config.enabled !== false) {
        throw new Error("Fresh production smoke DATA_DIR should start with OTel export disabled.");
      }
      if (payload.config.headersConfigured !== false) {
        throw new Error("Fresh production smoke DATA_DIR should start without configured OTel headers.");
      }
      if ("headers" in payload.config) {
        throw new Error("Admin OTel payload exposed writeOnly headers.");
      }
    }, stdoutRef, stderrRef);

    await expectJson(baseUrl, "/api/config/schema?packages=ai-client%20mcp-client%20otel%20ai-request-middleware", (payload) => {
      if (!payload?.properties || typeof payload.properties !== "object") {
        throw new Error("Config schema payload is missing its properties object.");
      }

      if (!payload.properties["ai-client"] || !payload.properties["mcp-client"] || !payload.properties.otel || !payload.properties["ai-request-middleware"]) {
        throw new Error("Config schema payload is missing one of the required app schemas.");
      }
    }, stdoutRef, stderrRef);

    await expectJson(baseUrl, "/mcp/manifest", (payload) => {
      if (!Array.isArray(payload?.tools) || payload.tools.length === 0) {
        throw new Error("MCP manifest is missing registered tools.");
      }

      if (!Array.isArray(payload?.prompts) || payload.prompts.length === 0) {
        throw new Error("MCP manifest is missing registered prompts.");
      }
    }, stdoutRef, stderrRef);

    const mcpSession = await createMcpSession(baseUrl, stdoutRef, stderrRef);
    const mcpTools = await sendMcpRequest(baseUrl, mcpSession, {
      jsonrpc: "2.0",
      id: "smoke-tools-list",
      method: "tools/list",
    }, stdoutRef, stderrRef);
    if (!Array.isArray(mcpTools?.tools) || mcpTools.tools.length === 0) {
      throw new Error("Sessionized MCP tools/list did not return registered tools.");
    }

    const mcpListRequests = await sendMcpRequest(baseUrl, mcpSession, {
      jsonrpc: "2.0",
      id: "smoke-tools-call-list-requests",
      method: "tools/call",
      params: {
        name: "list_requests",
        arguments: {},
      },
    }, stdoutRef, stderrRef);
    if (!Array.isArray(mcpListRequests?.structuredContent?.requests)) {
      throw new Error("Sessionized MCP tools/call list_requests did not return a requests array.");
    }

    await expectSse(baseUrl, "/api/llmproxy/admin/events", async () => undefined, stdoutRef, stderrRef);

    const createdConnection = await sendJson(
      baseUrl,
      "/api/llmproxy/admin/connections",
      "POST",
      {
        id: "smoke-openai",
        name: "Smoke OpenAI",
        baseUrl: "http://127.0.0.1:9091",
        connector: "openai",
        enabled: true,
        maxConcurrency: 2,
        models: ["smoke-model"],
        apiKey: "super-secret-key",
      },
      (payload) => {
        if (payload?.ok !== true || payload?.connection?.id !== "smoke-openai") {
          throw new Error("Connection create response did not contain the created connection.");
        }

        if ("apiKey" in payload.connection) {
          throw new Error("Connection create response exposed the writeOnly apiKey.");
        }
      },
      stdoutRef,
      stderrRef,
    );

    await sendJson(
      baseUrl,
      "/api/llmproxy/admin/config/server",
      "PUT",
      {
        requestTimeoutMs: 12345,
        queueTimeoutMs: 23456,
        healthCheckIntervalMs: 34567,
        recentRequestLimit: 456,
      },
      (payload) => {
        if (payload?.ok !== true || payload?.settings?.requestTimeoutMs !== 12345) {
          throw new Error("AI client settings update was not applied.");
        }
      },
      stdoutRef,
      stderrRef,
    );

    await sendJson(
      baseUrl,
      "/api/llmproxy/admin/otel",
      "PUT",
      {
        enabled: true,
        endpoint: "https://collector.example.com/v1/traces",
        headers: {
          authorization: "Bearer smoke-otel-token",
          "x-tenant": "smoke",
        },
        timeoutMs: 2500,
        serviceName: "llmproxy-smoke",
        serviceNamespace: "edge",
        deploymentEnvironment: "production",
        captureMessageContent: true,
        captureToolContent: true,
      },
      (payload) => {
        if (payload?.ok !== true || payload?.config?.endpoint !== "https://collector.example.com/v1/traces") {
          throw new Error("OTel exporter settings update was not applied.");
        }
        if (payload?.config?.serviceName !== "llmproxy-smoke") {
          throw new Error("OTel exporter settings update did not persist the serviceName.");
        }
        if (payload?.config?.headersConfigured !== true) {
          throw new Error("OTel exporter settings update did not report configured writeOnly headers.");
        }
        if ("headers" in payload.config) {
          throw new Error("OTel exporter settings update exposed writeOnly headers.");
        }
      },
      stdoutRef,
      stderrRef,
    );

    await sendJson(
      baseUrl,
      "/api/llmproxy/admin/connections/smoke-openai",
      "PUT",
      {
        id: "smoke-openai-renamed",
        name: "Smoke OpenAI Renamed",
        baseUrl: "http://127.0.0.1:9092",
        connector: "openai",
        enabled: true,
        maxConcurrency: 3,
        models: ["smoke-model", "smoke-model-2"],
        clearApiKey: false,
      },
      (payload) => {
        if (payload?.ok !== true || payload?.connection?.id !== "smoke-openai-renamed") {
          throw new Error("Connection replace response did not contain the renamed connection.");
        }

        if ("apiKey" in payload.connection) {
          throw new Error("Connection replace response exposed the writeOnly apiKey.");
        }
      },
      stdoutRef,
      stderrRef,
    );

    const listedConnections = await expectJson(baseUrl, "/api/llmproxy/admin/connections", (payload) => {
      if (!Array.isArray(payload?.data) || payload.data.length !== 1) {
        throw new Error("Expected exactly one connection after the smoke CRUD cycle.");
      }
    }, stdoutRef, stderrRef);
    if (listedConnections.data[0]?.id !== "smoke-openai-renamed") {
      throw new Error("Connection listing did not return the renamed connection.");
    }
    if ("apiKey" in listedConnections.data[0]) {
      throw new Error("Connection listing exposed the writeOnly apiKey.");
    }

    await sendJson(
      baseUrl,
      "/api/llmproxy/admin/mcp-client/servers",
      "POST",
      {
        id: "smoke-mcp",
        title: "Smoke MCP",
        endpoint: "https://example.com/mcp",
        headers: {
          authorization: "Bearer smoke-token",
        },
      },
      (payload) => {
        if (payload?.ok !== true || payload?.server?.id !== "smoke-mcp") {
          throw new Error("MCP server create response did not contain the created server.");
        }
      },
      stdoutRef,
      stderrRef,
    );

    await sendJson(
      baseUrl,
      "/api/llmproxy/admin/mcp-client/servers/smoke-mcp",
      "PUT",
      {
        id: "smoke-mcp-renamed",
        title: "Smoke MCP Renamed",
        endpoint: "https://example.com/renamed-mcp",
        transport: "streamable-http",
        protocolVersion: "2025-11-25",
      },
      (payload) => {
        if (payload?.ok !== true || payload?.server?.id !== "smoke-mcp-renamed") {
          throw new Error("MCP server replace response did not contain the renamed server.");
        }
      },
      stdoutRef,
      stderrRef,
    );

    const listedMcpServers = await expectJson(baseUrl, "/api/llmproxy/admin/mcp-client/servers", (payload) => {
      if (!Array.isArray(payload?.data) || payload.data.length !== 1) {
        throw new Error("Expected exactly one MCP server after the smoke CRUD cycle.");
      }
    }, stdoutRef, stderrRef);
    if (listedMcpServers.data[0]?.id !== "smoke-mcp-renamed") {
      throw new Error("MCP server listing did not return the renamed server.");
    }

    await sendJson(
      baseUrl,
      "/api/llmproxy/admin/ai-request-middleware/middlewares",
      "POST",
      {
        id: "smoke-router",
        url: "https://router.example.com/route",
        models: {
          small: "gpt-4.1-mini",
          large: "gpt-5",
        },
      },
      (payload) => {
        if (payload?.ok !== true || payload?.middleware?.id !== "smoke-router") {
          throw new Error("AI request middleware create response did not contain the created middleware.");
        }
      },
      stdoutRef,
      stderrRef,
    );

    await sendJson(
      baseUrl,
      "/api/llmproxy/admin/ai-request-middleware/middlewares/smoke-router",
      "PUT",
      {
        id: "smoke-router-renamed",
        url: "https://router.example.com/route-two",
        models: {
          small: "gpt-4.1-nano",
          large: "gpt-5-mini",
        },
      },
      (payload) => {
        if (payload?.ok !== true || payload?.middleware?.id !== "smoke-router-renamed") {
          throw new Error("AI request middleware replace response did not contain the renamed middleware.");
        }
      },
      stdoutRef,
      stderrRef,
    );

    const listedAiRequestMiddlewares = await expectJson(baseUrl, "/api/llmproxy/admin/ai-request-middleware/middlewares", (payload) => {
      if (!Array.isArray(payload?.data) || payload.data.length !== 1) {
        throw new Error("Expected exactly one AI request middleware after the smoke CRUD cycle.");
      }
    }, stdoutRef, stderrRef);
    if (listedAiRequestMiddlewares.data[0]?.id !== "smoke-router-renamed") {
      throw new Error("AI request middleware listing did not return the renamed middleware.");
    }

    await expectJson(baseUrl, "/api/config?packages=ai-client%20mcp-client%20otel%20ai-request-middleware", (payload) => {
      const aiClientConfig = payload?.["ai-client"];
      const mcpClientConfig = payload?.["mcp-client"];
      const otelConfig = payload?.otel;
      const aiRequestMiddlewareConfig = payload?.["ai-request-middleware"];

      if (!aiClientConfig || typeof aiClientConfig !== "object") {
        throw new Error("Public ai-client config payload is missing.");
      }
      if (!mcpClientConfig || typeof mcpClientConfig !== "object") {
        throw new Error("Public mcp-client config payload is missing.");
      }
      if (!otelConfig || typeof otelConfig !== "object") {
        throw new Error("Public otel config payload is missing.");
      }
      if (!aiRequestMiddlewareConfig || typeof aiRequestMiddlewareConfig !== "object") {
        throw new Error("Public ai-request-middleware config payload is missing.");
      }

      if (!Array.isArray(aiClientConfig.connections) || aiClientConfig.connections.length !== 1) {
        throw new Error("Public ai-client config did not expose the saved connection.");
      }
      if (aiClientConfig.connections[0]?.id !== "smoke-openai-renamed") {
        throw new Error("Public ai-client config did not return the renamed connection.");
      }
      if ("apiKey" in aiClientConfig.connections[0]) {
        throw new Error("Public ai-client config exposed the writeOnly apiKey.");
      }
      if (aiClientConfig.requestTimeoutMs !== 12345) {
        throw new Error("Public ai-client config did not return the saved root AI client settings.");
      }

      if (!Array.isArray(mcpClientConfig.servers) || mcpClientConfig.servers.length !== 1) {
        throw new Error("Public mcp-client config did not expose the saved server.");
      }
      if (mcpClientConfig.servers[0]?.id !== "smoke-mcp-renamed") {
        throw new Error("Public mcp-client config did not return the renamed server.");
      }

      if (otelConfig.endpoint !== "https://collector.example.com/v1/traces") {
        throw new Error("Public otel config did not return the saved endpoint.");
      }
      if (otelConfig.timeoutMs !== 2500 || otelConfig.enabled !== true) {
        throw new Error("Public otel config did not return the saved exporter settings.");
      }
      if ("headers" in otelConfig) {
        throw new Error("Public otel config did not preserve writeOnly header redaction.");
      }
      if (otelConfig.serviceName !== "llmproxy-smoke" || otelConfig.serviceNamespace !== "edge") {
        throw new Error("Public otel config did not return the saved resource attributes.");
      }
      if (otelConfig.deploymentEnvironment !== "production") {
        throw new Error("Public otel config did not return the saved deployment environment.");
      }
      if (otelConfig.captureMessageContent !== true || otelConfig.captureToolContent !== true) {
        throw new Error("Public otel config did not return the saved content capture flags.");
      }

      if (!Array.isArray(aiRequestMiddlewareConfig.middlewares) || aiRequestMiddlewareConfig.middlewares.length !== 1) {
        throw new Error("Public ai-request-middleware config did not expose the saved middleware.");
      }
      if (aiRequestMiddlewareConfig.middlewares[0]?.id !== "smoke-router-renamed") {
        throw new Error("Public ai-request-middleware config did not return the renamed middleware.");
      }
      if (
        aiRequestMiddlewareConfig.middlewares[0]?.models?.small !== "gpt-4.1-nano"
        || aiRequestMiddlewareConfig.middlewares[0]?.models?.large !== "gpt-5-mini"
      ) {
        throw new Error("Public ai-request-middleware config did not return the saved model mapping.");
      }
    }, stdoutRef, stderrRef);

    await expectJson(baseUrl, "/api/config/ai-client", (payload) => {
      if (!Array.isArray(payload?.connections) || payload.connections.length !== 1) {
        throw new Error("Single-package ai-client config read did not return the saved connection.");
      }
      if ("apiKey" in payload.connections[0]) {
        throw new Error("Single-package ai-client config read exposed the writeOnly apiKey.");
      }
    }, stdoutRef, stderrRef);

    await expectJson(baseUrl, "/api/config/mcp-client", (payload) => {
      if (!Array.isArray(payload?.servers) || payload.servers.length !== 1) {
        throw new Error("Single-package mcp-client config read did not return the saved server.");
      }
    }, stdoutRef, stderrRef);

    await expectJson(baseUrl, "/api/config/otel", (payload) => {
      if (payload?.endpoint !== "https://collector.example.com/v1/traces") {
        throw new Error("Single-package otel config read did not return the saved endpoint.");
      }
      if (payload?.timeoutMs !== 2500 || payload?.enabled !== true) {
        throw new Error("Single-package otel config read did not return the saved exporter settings.");
      }
      if ("headers" in payload) {
        throw new Error("Single-package otel config read exposed writeOnly headers.");
      }
      if (payload?.serviceName !== "llmproxy-smoke" || payload?.serviceNamespace !== "edge") {
        throw new Error("Single-package otel config read did not return the saved resource attributes.");
      }
      if (payload?.deploymentEnvironment !== "production") {
        throw new Error("Single-package otel config read did not return the saved deployment environment.");
      }
      if (payload?.captureMessageContent !== true || payload?.captureToolContent !== true) {
        throw new Error("Single-package otel config read did not return the saved content capture flags.");
      }
    }, stdoutRef, stderrRef);

    await expectJson(baseUrl, "/api/config/ai-request-middleware", (payload) => {
      if (!Array.isArray(payload?.middlewares) || payload.middlewares.length !== 1) {
        throw new Error("Single-package ai-request-middleware config read did not return the saved middleware.");
      }
      if (payload.middlewares[0]?.id !== "smoke-router-renamed") {
        throw new Error("Single-package ai-request-middleware config read did not return the renamed middleware.");
      }
      if (
        payload.middlewares[0]?.models?.small !== "gpt-4.1-nano"
        || payload.middlewares[0]?.models?.large !== "gpt-5-mini"
      ) {
        throw new Error("Single-package ai-request-middleware config read did not return the saved model mapping.");
      }
    }, stdoutRef, stderrRef);

    await sendJson(
      baseUrl,
      "/api/llmproxy/admin/connections/smoke-openai-renamed",
      "DELETE",
      undefined,
      (payload) => {
        if (payload?.ok !== true || payload?.connectionId !== "smoke-openai-renamed") {
          throw new Error("Connection delete response did not confirm the deleted connection.");
        }
      },
      stdoutRef,
      stderrRef,
    );

    await sendJson(
      baseUrl,
      "/api/llmproxy/admin/mcp-client/servers/smoke-mcp-renamed",
      "DELETE",
      undefined,
      (payload) => {
        if (payload?.ok !== true || payload?.serverId !== "smoke-mcp-renamed") {
          throw new Error("MCP server delete response did not confirm the deleted server.");
        }
      },
      stdoutRef,
      stderrRef,
    );

    await sendJson(
      baseUrl,
      "/api/llmproxy/admin/ai-request-middleware/middlewares/smoke-router-renamed",
      "DELETE",
      undefined,
      (payload) => {
        if (payload?.ok !== true || payload?.middlewareId !== "smoke-router-renamed") {
          throw new Error("AI request middleware delete response did not confirm the deleted middleware.");
        }
      },
      stdoutRef,
      stderrRef,
    );

    const aiClientConfigPath = path.join(dataDir, "config", "ai-client", "config.json");
    const mcpClientConfigPath = path.join(dataDir, "config", "mcp-client", "config.json");
    const otelConfigPath = path.join(dataDir, "config", "otel", "config.json");
    const aiRequestMiddlewareConfigPath = path.join(dataDir, "config", "ai-request-middleware", "config.json");
    const aiClientConfig = await expectFileJson(aiClientConfigPath);
    const mcpClientConfig = await expectFileJson(mcpClientConfigPath);
    const otelConfig = await expectFileJson(otelConfigPath);
    const aiRequestMiddlewareConfig = await expectFileJson(aiRequestMiddlewareConfigPath);

    if (!Array.isArray(aiClientConfig.connections) || aiClientConfig.connections.length !== 0) {
      throw new Error("Persisted ai-client config should end the smoke run without connections.");
    }
    if (aiClientConfig.requestTimeoutMs !== 12345) {
      throw new Error("Persisted ai-client config did not keep the saved requestTimeoutMs.");
    }
    if (!Array.isArray(mcpClientConfig.servers) || mcpClientConfig.servers.length !== 0) {
      throw new Error("Persisted mcp-client config should end the smoke run without servers.");
    }
    if (otelConfig.endpoint !== "https://collector.example.com/v1/traces" || otelConfig.timeoutMs !== 2500 || otelConfig.enabled !== true) {
      throw new Error("Persisted otel config did not keep the saved exporter settings.");
    }
    if (otelConfig.serviceName !== "llmproxy-smoke" || otelConfig.serviceNamespace !== "edge") {
      throw new Error("Persisted otel config did not keep the saved resource attributes.");
    }
    if (otelConfig.deploymentEnvironment !== "production") {
      throw new Error("Persisted otel config did not keep the saved deployment environment.");
    }
    if (otelConfig.captureMessageContent !== true || otelConfig.captureToolContent !== true) {
      throw new Error("Persisted otel config did not keep the saved content capture flags.");
    }
    if (
      otelConfig.headers?.authorization !== "Bearer smoke-otel-token"
      || otelConfig.headers?.["x-tenant"] !== "smoke"
    ) {
      throw new Error("Persisted otel config did not keep the saved writeOnly headers.");
    }
    if (!Array.isArray(aiRequestMiddlewareConfig.middlewares) || aiRequestMiddlewareConfig.middlewares.length !== 0) {
      throw new Error("Persisted ai-request-middleware config should end the smoke run without middlewares.");
    }

    await expectHtml(baseUrl, "/dashboard/config/connections", stdoutRef, stderrRef);

    process.stdout.write(`Production smoke passed on ${baseUrl}.\n`);
  } finally {
    server.kill("SIGTERM");
    await delay(1000);
    if (!server.killed) {
      server.kill("SIGKILL");
    }

    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
