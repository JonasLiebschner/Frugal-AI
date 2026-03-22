import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAiRequestMiddlewareRows,
  buildMcpServicesForDocs,
  buildOpenAiRouteRows,
  buildOtelConfigRows,
  buildServerConfigRows,
} from "../llmproxy-client";

test("buildOpenAiRouteRows returns stable OpenAI-compatible routes", () => {
  assert.deepEqual(buildOpenAiRouteRows("https://proxy.example.com"), [
    {
      route: "GET https://proxy.example.com/v1/models",
      purpose: "List the aggregated model catalog exposed by llmproxy in the standard OpenAI-compatible model-list format.",
    },
    {
      route: "POST https://proxy.example.com/v1/chat/completions",
      purpose: "Run chat completions through llmproxy with the normal OpenAI-compatible request body, including streaming, tools, and generation parameters.",
    },
  ]);
});

test("buildMcpServicesForDocs maps tools into renderer-friendly function definitions", () => {
  const docs = buildMcpServicesForDocs([{
    id: "diag",
    title: "Diagnostics",
    description: "Inspect requests",
    helperRoutes: [],
    tools: [{
      name: "diagnose_request",
      title: "Diagnose request",
      description: "Inspect a request",
    }],
    prompts: [],
  }]);

  assert.equal(docs.length, 1);
  assert.deepEqual(docs[0]?.toolsForRenderer, [{
    type: "function",
    function: {
      name: "diagnose_request",
      description: "Inspect a request",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  }]);
});

test("buildServerConfigRows includes current MCP runtime status when available", () => {
  const rows = buildServerConfigRows({
    requestTimeoutMs: 60000,
    queueTimeoutMs: 30000,
    healthCheckIntervalMs: 10000,
    recentRequestLimit: 1000,
  }, false);

  assert.equal(rows.at(-1)?.key, "MCP server");
  assert.equal(rows.at(-1)?.value, "disabled");
});

test("buildOtelConfigRows renders write-only headers and empty endpoint defaults", () => {
  const rows = buildOtelConfigRows({
    enabled: true,
    endpoint: "",
    headersConfigured: true,
    timeoutMs: 15000,
    serviceName: "llmproxy",
    serviceNamespace: "",
    deploymentEnvironment: "",
    captureMessageContent: false,
    captureToolContent: true,
  });

  assert.equal(rows[1]?.value, "Environment/default OTLP resolution");
  assert.equal(rows[2]?.value, "configured (write-only)");
});

test("buildAiRequestMiddlewareRows preserves middleware order and model mappings", () => {
  const rows = buildAiRequestMiddlewareRows([
    {
      id: "router-a",
      url: "https://router-a.example.com/api/v1/classify",
      models: {
        small: "gpt-4.1-mini",
        large: "gpt-4.1",
      },
    },
  ]);

  assert.deepEqual(rows, [{
    order: 1,
    id: "router-a",
    url: "https://router-a.example.com/api/v1/classify",
    smallModel: "gpt-4.1-mini",
    largeModel: "gpt-4.1",
  }]);
});
