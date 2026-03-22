import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDiagnosticPrompt,
  buildDiagnosticReport,
  listDiagnosticPrompts,
} from "../server/ai-proxy-diagnostics";
import type { ProxySnapshot, RequestLogDetail } from "../../shared/type-api";

function createSnapshot(): ProxySnapshot {
  return {
    startedAt: new Date().toISOString(),
    queueDepth: 0,
    recentRequestLimit: 1000,
    totals: {
      activeRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cancelledRequests: 0,
      rejectedRequests: 0,
    },
    backends: [
      {
        id: "backend-a",
        name: "Backend A",
        baseUrl: "http://127.0.0.1:1",
        connector: "openai",
        enabled: true,
        healthy: true,
        maxConcurrency: 1,
        activeRequests: 0,
        availableSlots: 1,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        cancelledRequests: 0,
        configuredModels: ["demo-model"],
        discoveredModels: ["demo-model"],
        discoveredModelDetails: [
          {
            id: "demo-model",
            metadata: {
              max_completion_tokens: 4096,
            },
          },
        ],
      },
    ],
    activeConnections: [],
    recentRequests: [],
  };
}

test("diagnostics detect truncated completions that hit the token limit", () => {
  const snapshot = createSnapshot();
  const detail: RequestLogDetail = {
    entry: {
      id: "request-length",
      time: new Date().toISOString(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "demo-model",
      backendId: "backend-a",
      backendName: "Backend A",
      outcome: "success",
      latencyMs: 1200,
      queuedMs: 0,
      completionTokens: 512,
      effectiveCompletionTokenLimit: 512,
      finishReason: "length",
      hasDetail: true,
    },
    requestBody: {
      model: "demo-model",
      max_completion_tokens: 512,
      messages: [
        {
          role: "user",
          content: "Write a very long answer.",
        },
      ],
    },
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
  };

  const report = buildDiagnosticReport(detail, snapshot);

  assert.equal(report.signals.maxTokensReached, true);
  assert.equal(report.requestTokenLimit, 512);
  assert.equal(report.effectiveTokenLimit, 512);
  assert.ok(report.findings.some((finding) => finding.code === "max_tokens_reached"));
});

test("diagnostics detect repeated output patterns", () => {
  const snapshot = createSnapshot();
  const detail: RequestLogDetail = {
    entry: {
      id: "request-repeat",
      time: new Date().toISOString(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "demo-model",
      backendId: "backend-a",
      backendName: "Backend A",
      outcome: "success",
      latencyMs: 1600,
      queuedMs: 0,
      completionTokens: 300,
      finishReason: "stop",
      hasDetail: true,
    },
    requestBody: {
      model: "demo-model",
      messages: [
        {
          role: "user",
          content: "Say one sentence.",
        },
      ],
    },
    responseBody: {
      choices: [
        {
          message: {
            role: "assistant",
            content: "This will loop forever. This will loop forever. This will loop forever. This will loop forever.",
          },
        },
      ],
    },
  };

  const report = buildDiagnosticReport(detail, snapshot);

  assert.equal(report.signals.repetitionDetected, true);
  assert.ok(report.findings.some((finding) => finding.code === "endless_repetition"));
});

test("diagnostics detect malformed tool call arguments", () => {
  const snapshot = createSnapshot();
  const detail: RequestLogDetail = {
    entry: {
      id: "request-bad-tool-call",
      time: new Date().toISOString(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "demo-model",
      backendId: "backend-a",
      backendName: "Backend A",
      outcome: "success",
      latencyMs: 900,
      queuedMs: 0,
      finishReason: "tool_calls",
      hasDetail: true,
    },
    requestBody: {
      model: "demo-model",
      tools: [
        {
          type: "function",
          function: {
            name: "diagnose_request",
          },
        },
      ],
    },
    responseBody: {
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_bad",
                type: "function",
                function: {
                  name: "diagnose_request",
                  arguments: "{\"request_id\":",
                },
              },
            ],
          },
        },
      ],
    },
  };

  const report = buildDiagnosticReport(detail, snapshot);

  assert.equal(report.signals.malformedToolCall, true);
  assert.ok(report.findings.some((finding) => finding.code === "malformed_tool_call"));
});

test("diagnostics detect tool-result errors in the next assistant turn", () => {
  const snapshot = createSnapshot();
  const detail: RequestLogDetail = {
    entry: {
      id: "request-tool-error",
      time: new Date().toISOString(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "demo-model",
      backendId: "backend-a",
      backendName: "Backend A",
      outcome: "success",
      latencyMs: 1100,
      queuedMs: 0,
      finishReason: "stop",
      hasDetail: true,
    },
    requestBody: {
      model: "demo-model",
      messages: [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_diag",
              type: "function",
              function: {
                name: "diagnose_request",
                arguments: "{\"request_id\":\"abc\"}",
              },
            },
          ],
        },
        {
          role: "tool",
          name: "diagnose_request",
          tool_call_id: "call_diag",
          content: JSON.stringify({
            error: {
              message: "Invalid request_id.",
            },
          }),
        },
      ],
    },
    responseBody: {
      choices: [
        {
          message: {
            role: "assistant",
            content: "I could not inspect that request because the tool call failed.",
          },
        },
      ],
    },
  };

  const report = buildDiagnosticReport(detail, snapshot);

  assert.equal(report.signals.toolResultError, true);
  assert.ok(report.findings.some((finding) => finding.code === "tool_result_error"));
});

test("diagnostics detect interrupted responses after a cancellation", () => {
  const snapshot = createSnapshot();
  const detail: RequestLogDetail = {
    entry: {
      id: "request-cancelled-mid-response",
      time: new Date().toISOString(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "demo-model",
      backendId: "backend-a",
      backendName: "Backend A",
      outcome: "cancelled",
      latencyMs: 750,
      queuedMs: 0,
      error: "Client cancelled request.",
      hasDetail: true,
    },
    requestBody: {
      model: "demo-model",
      messages: [
        {
          role: "user",
          content: "Keep writing until I stop you.",
        },
      ],
    },
    responseBody: {
      choices: [
        {
          message: {
            role: "assistant",
            content: "This is only the beginning of the answer before the stream was interrupted.",
          },
        },
      ],
    },
  };

  const report = buildDiagnosticReport(detail, snapshot);

  assert.equal(report.signals.interruptedResponse, true);
  assert.ok(report.findings.some((finding) => finding.code === "interrupted_response"));
});

test("diagnostics detect interrupted responses that only retained reasoning", () => {
  const snapshot = createSnapshot();
  const detail: RequestLogDetail = {
    entry: {
      id: "request-cancelled-reasoning-only",
      time: new Date().toISOString(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "demo-model",
      backendId: "backend-a",
      backendName: "Backend A",
      outcome: "cancelled",
      latencyMs: 820,
      queuedMs: 0,
      error: "Client disconnected.",
      completionTokens: 1,
      hasDetail: true,
    },
    requestBody: {
      model: "demo-model",
      messages: [
        {
          role: "user",
          content: "Think first.",
        },
      ],
    },
    responseBody: {
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            reasoning_content: "Okay",
          },
        },
      ],
    },
  };

  const report = buildDiagnosticReport(detail, snapshot);

  assert.equal(report.signals.interruptedResponse, true);
  assert.ok(report.findings.some((finding) => finding.code === "interrupted_response"));
});

test("diagnostics analyze retained raw upstream error payloads", () => {
  const snapshot = createSnapshot();
  const detail: RequestLogDetail = {
    entry: {
      id: "request-raw-upstream-error",
      time: new Date().toISOString(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "demo-model",
      backendId: "backend-a",
      backendName: "Backend A",
      outcome: "error",
      latencyMs: 440,
      queuedMs: 0,
      statusCode: 400,
      hasDetail: true,
    },
    requestBody: {
      model: "demo-model",
      messages: [
        {
          role: "user",
          content: "Help.",
        },
      ],
    },
    responseBody: {
      error: {
        message: "messages[1].content must be a string.",
        type: "invalid_request_error",
        code: "bad_request",
      },
    },
  };

  const report = buildDiagnosticReport(detail, snapshot);
  const finding = report.findings.find((candidate) => candidate.code === "upstream_error");

  assert.equal(report.signals.upstreamError, true);
  assert.match(report.summary, /HTTP 400/);
  assert.match(report.summary, /messages\[1\]\.content must be a string/);
  assert.match(report.outputPreview, /invalid_request_error/);
  assert.ok(finding);
  assert.match(finding?.summary ?? "", /HTTP 400/);
  assert.match((finding?.evidence ?? []).join(" "), /Retained raw response:/);
  assert.match((finding?.evidence ?? []).join(" "), /messages\[1\]\.content must be a string/);
});

test("diagnostics prompts expose a general request diagnosis playbook", () => {
  const snapshot = createSnapshot();
  const detail: RequestLogDetail = {
    entry: {
      id: "request-prompt",
      time: new Date().toISOString(),
      method: "POST",
      path: "/v1/chat/completions",
      model: "demo-model",
      backendId: "backend-a",
      backendName: "Backend A",
      outcome: "error",
      latencyMs: 700,
      queuedMs: 0,
      error: "Upstream timeout after 30000ms.",
      hasDetail: true,
    },
    requestBody: {
      model: "demo-model",
      messages: [
        {
          role: "user",
          content: "Help.",
        },
      ],
    },
    responseBody: undefined,
  };

  const prompts = listDiagnosticPrompts();
  assert.ok(prompts.some((prompt) => prompt.name === "diagnose-request"));

  const prompt = buildDiagnosticPrompt("diagnose-request", detail, snapshot);
  assert.equal(prompt.messages[0]?.role, "system");
  assert.equal(prompt.messages[1]?.role, "user");
  assert.match(prompt.messages[1]?.text ?? "", /request-prompt/);
  assert.match(prompt.messages[1]?.text ?? "", /Structured context/);
});
