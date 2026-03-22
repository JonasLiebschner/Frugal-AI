import assert from "node:assert/strict";
import test from "node:test";

import { createAjvTestValidationService } from "../../ajv/test/runtime-api";
import type { RequestFetch } from "../../shared/server/request-fetch";
import { createToolRegistryTestRegistry } from "../../tool-registry/test/runtime-api";
import {
  aiProxyInternalRequestDiagnosticsPath,
  aiProxyInternalRequestsPath,
  aiProxyToolRegistryToolProviders,
  buildAiProxyInternalRequestDiagnosticsPath,
  buildAiProxyInternalRequestListPath,
  buildAiProxyInternalRequestPath,
} from "../server/ai-proxy-capability";

function createRequestFetch(
  handler: (request: string, options?: any) => Promise<unknown>,
): RequestFetch {
  return async <T = unknown>(request: string, options?: any) => handler(request, options) as T;
}

test("ai-proxy tool providers expose the expected built-in tools", () => {
  const registry = createToolRegistryTestRegistry<RequestFetch>({
    validation: createAjvTestValidationService(),
  });

  registry.registerTool(aiProxyToolRegistryToolProviders);

  const services = registry.getServices(createRequestFetch(async () => {
    throw new Error("not used in this test");
  }));

  assert.equal(services.length, 1);
  assert.deepEqual(
    services[0]?.definition.tools.map((tool) => tool.name).sort(),
    [
      "chat_with_model",
      "diagnose_request",
      "get_request_detail",
      "list_models",
      "list_requests",
    ],
  );
});

test("chat_with_model uses the internal chat completion route and forces stream=false", async () => {
  const registry = createToolRegistryTestRegistry<RequestFetch>({
    validation: createAjvTestValidationService(),
  });
  let capturedPath = "";
  let capturedBody: unknown;

  registry.registerTool(aiProxyToolRegistryToolProviders);

  const services = registry.getServices(createRequestFetch(async (path, options) => {
    capturedPath = path;
    capturedBody = options?.body;
    return {
      object: "chat.completion",
      model: "diagnostics-model",
      choices: [
        {
          finish_reason: "stop",
        },
      ],
    };
  }));

  const result = await services[0]?.callTool("chat_with_model", {
    model: "diagnostics-model",
    messages: [
      {
        role: "user",
        content: "Hello",
      },
    ],
  });

  assert.equal(capturedPath, "/v1/chat/completions");
  assert.deepEqual(capturedBody, {
    model: "diagnostics-model",
    messages: [
      {
        role: "user",
        content: "Hello",
      },
    ],
    stream: false,
  });
  assert.deepEqual(result?.structuredContent, {
    object: "chat.completion",
    model: "diagnostics-model",
    choices: [
      {
        finish_reason: "stop",
      },
    ],
  });
});

test("diagnostics and request tools use ai-proxy internal routes", async () => {
  const registry = createToolRegistryTestRegistry<RequestFetch>({
    validation: createAjvTestValidationService(),
  });
  const requestedPaths: string[] = [];

  registry.registerTool(aiProxyToolRegistryToolProviders);

  const services = registry.getServices(createRequestFetch(async (path, options) => {
    requestedPaths.push(path);

    if (path.startsWith(`${aiProxyInternalRequestDiagnosticsPath}/`)) {
      return {
        report: {
          requestId: "req-1",
          generatedAt: "2024-01-01T00:00:00.000Z",
          live: false,
          status: "success",
          summary: "Synthetic diagnostics report",
          findings: [],
          recommendedPrompts: [],
          facts: [],
          signals: {
            maxTokensReached: false,
            repetitionDetected: false,
            malformedToolCall: false,
            toolResultError: false,
            interruptedResponse: false,
            requestRejected: false,
            upstreamError: false,
          },
        },
      };
    }

    if (path.startsWith(`${aiProxyInternalRequestsPath}/`) && options?.query === undefined) {
      return {
        detail: {
          entry: {
            id: "req-1",
          },
        },
      };
    }

    if (path === buildAiProxyInternalRequestListPath()) {
      return {
        requests: [
          {
            id: "req-1",
            time: "2024-01-01T00:00:00.000Z",
            live: false,
            status: "success",
            method: "POST",
            path: "/v1/chat/completions",
            has_detail: true,
          },
        ],
      };
    }

    throw new Error(`Unexpected path ${path}`);
  }));

  const getDetailResult = await services[0]?.callTool("get_request_detail", {
    request_id: "req-1",
  });
  const diagnoseResult = await services[0]?.callTool("diagnose_request", {
    request_id: "req-1",
  });
  const listResult = await services[0]?.callTool("list_requests", {
    limit: 1,
  });

  assert.deepEqual(requestedPaths, [
    buildAiProxyInternalRequestPath("req-1"),
    buildAiProxyInternalRequestDiagnosticsPath("req-1"),
    buildAiProxyInternalRequestListPath(),
  ]);
  assert.deepEqual(getDetailResult?.structuredContent, {
    entry: {
      id: "req-1",
    },
  });
  assert.equal(
    (diagnoseResult?.structuredContent as { summary?: string } | undefined)?.summary,
    "Synthetic diagnostics report",
  );
  assert.deepEqual(listResult?.structuredContent, {
    requests: [
      {
        id: "req-1",
        time: "2024-01-01T00:00:00.000Z",
        live: false,
        status: "success",
        method: "POST",
        path: "/v1/chat/completions",
        has_detail: true,
      },
    ],
  });
});
