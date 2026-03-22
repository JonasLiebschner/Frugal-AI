import assert from "node:assert/strict";
import test from "node:test";

import type { ConnectionConfig, RequestLogDetail } from "../../shared/type-api";
import {
  buildAiClientGenAiRequestTrace,
} from "../server/ai-client-capability";

const TEST_CONNECTION: ConnectionConfig = {
  id: "primary",
  name: "Primary",
  baseUrl: "https://models.example.com",
  connector: "openai",
  enabled: true,
  maxConcurrency: 2,
  models: ["chat-local"],
};

const TEST_DETAIL: RequestLogDetail = {
  entry: {
    id: "req-otel-1",
    time: "2026-03-20T12:00:00.000Z",
    method: "POST",
    path: "/v1/chat/completions",
    model: "chat-local",
    routingMiddlewareId: "external-model-router",
    routingMiddlewareProfile: "large",
    backendId: "primary",
    backendName: "Primary",
    outcome: "success",
    latencyMs: 120,
    queuedMs: 4,
    energyUsageWh: 0.0832,
    statusCode: 200,
    promptTokens: 15,
    completionTokens: 9,
    totalTokens: 24,
    finishReason: "stop",
    diagnosticSeverity: "warn",
    diagnosticTitle: "Token pressure",
    diagnosticSummary: "The response stopped because it reached the requested limit.",
    hasDetail: true,
  },
  requestBody: {
    model: "chat-local",
    messages: [
      {
        role: "user",
        content: "Say hello once.",
      },
    ],
    tools: [
      {
        type: "function",
        name: "lookup_weather",
      },
    ],
    temperature: 0.2,
    max_tokens: 64,
  },
  responseBody: {
    id: "chatcmpl-otel-1",
    model: "chat-local",
    choices: [
      {
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "Hello there.",
        },
      },
    ],
  },
};

test("metadata-only GenAI OTel traces omit prompt and tool content by default", () => {
  const span = buildAiClientGenAiRequestTrace(TEST_DETAIL, TEST_CONNECTION, {
    captureMessageContent: false,
    captureToolContent: false,
  });

  assert.equal(span.name, "chat chat-local");
  assert.equal(span.attributes?.["gen_ai.operation.name"], "chat");
  assert.equal(span.attributes?.["gen_ai.provider.name"], "openai");
  assert.equal(span.attributes?.["gen_ai.request.model"], "chat-local");
  assert.equal(span.attributes?.["gen_ai.response.id"], "chatcmpl-otel-1");
  assert.equal(span.attributes?.["gen_ai.usage.input_tokens"], 15);
  assert.equal(span.attributes?.["gen_ai.usage.output_tokens"], 9);
  assert.equal(span.status?.code, 0);
  assert.equal(span.attributes?.["llmproxy.request.id"], "req-otel-1");
  assert.equal(span.attributes?.["llmproxy.request.outcome"], "success");
  assert.equal(span.attributes?.["llmproxy.request.latency_ms"], 120);
  assert.equal(span.attributes?.["llmproxy.request.queued_ms"], 4);
  assert.equal(span.attributes?.["llmproxy.energy.usage.wh"], 0.0832);
  assert.equal(span.attributes?.["llmproxy.routing.middleware.id"], "external-model-router");
  assert.equal(span.attributes?.["llmproxy.routing.middleware.profile"], "large");
  assert.equal(span.attributes?.["llmproxy.connection.id"], "primary");
  assert.equal(span.attributes?.["llmproxy.connection.name"], "Primary");
  assert.equal(span.attributes?.["llmproxy.connection.connector"], "openai");
  assert.equal(span.attributes?.["llmproxy.diagnostic.severity"], "warn");
  assert.equal(span.attributes?.["llmproxy.diagnostic.title"], "Token pressure");
  assert.equal(span.attributes?.["llmproxy.diagnostic.summary"], "The response stopped because it reached the requested limit.");
  assert.equal(span.attributes?.["server.address"], "models.example.com");
  assert.equal(span.attributes?.["server.port"], 443);
  assert.equal(span.attributes?.["gen_ai.input.messages"], undefined);
  assert.equal(span.attributes?.["gen_ai.output.messages"], undefined);
  assert.equal(span.attributes?.["gen_ai.tool.definitions"], undefined);
  assert.equal(span.attributes?.["gen_ai.system_instructions"], undefined);
});

test("opted-in GenAI OTel traces include serialized messages and tool definitions", () => {
  const span = buildAiClientGenAiRequestTrace(TEST_DETAIL, TEST_CONNECTION, {
    captureMessageContent: true,
    captureToolContent: true,
  });

  const inputMessages = span.attributes?.["gen_ai.input.messages"];
  const outputMessages = span.attributes?.["gen_ai.output.messages"];
  const toolDefinitions = span.attributes?.["gen_ai.tool.definitions"];

  assert.equal(typeof inputMessages, "string");
  assert.deepEqual(JSON.parse(String(inputMessages)), [
    {
      role: "user",
      parts: [
        {
          type: "text",
          content: "Say hello once.",
        },
      ],
    },
  ]);
  assert.equal(typeof outputMessages, "string");
  assert.deepEqual(JSON.parse(String(outputMessages)), [
    {
      role: "assistant",
      parts: [
        {
          type: "text",
          content: "Hello there.",
        },
      ],
      finish_reason: "stop",
    },
  ]);
  assert.equal(typeof toolDefinitions, "string");
  assert.deepEqual(JSON.parse(String(toolDefinitions)), [
    {
      type: "function",
      name: "lookup_weather",
    },
  ]);
});

test("GenAI OTel traces normalize OpenAI wrapper tool definitions and separate instructions", () => {
  const span = buildAiClientGenAiRequestTrace({
    ...TEST_DETAIL,
    requestBody: {
      model: "chat-local",
      instructions: "Answer briefly.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Describe this image.",
            },
            {
              type: "input_image",
              url: "https://example.com/cat.png",
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "lookup_weather",
            description: "Look up the weather.",
            parameters: {
              type: "object",
            },
            strict: true,
          },
        },
      ],
    },
    responseBody: {
      id: "chatcmpl-otel-2",
      model: "chat-local-2026-03-21",
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            tool_calls: [
              {
                id: "call_123",
                function: {
                  name: "lookup_weather",
                  arguments: "{\"location\":\"Paris\"}",
                },
              },
            ],
          },
        },
      ],
    },
  }, TEST_CONNECTION, {
    captureMessageContent: true,
    captureToolContent: true,
  });

  assert.deepEqual(JSON.parse(String(span.attributes?.["gen_ai.system_instructions"])), [
    {
      type: "text",
      content: "Answer briefly.",
    },
  ]);
  assert.deepEqual(JSON.parse(String(span.attributes?.["gen_ai.input.messages"])), [
    {
      role: "user",
      parts: [
        {
          type: "text",
          content: "Describe this image.",
        },
        {
          type: "uri",
          uri: "https://example.com/cat.png",
          modality: "image",
        },
      ],
    },
  ]);
  assert.deepEqual(JSON.parse(String(span.attributes?.["gen_ai.output.messages"])), [
    {
      role: "assistant",
      parts: [
        {
          type: "tool_call",
          id: "call_123",
          name: "lookup_weather",
          arguments: {
            location: "Paris",
          },
        },
      ],
      finish_reason: "tool_call",
    },
  ]);
  assert.deepEqual(JSON.parse(String(span.attributes?.["gen_ai.tool.definitions"])), [
    {
      type: "function",
      name: "lookup_weather",
      description: "Look up the weather.",
      parameters: {
        type: "object",
      },
      strict: true,
    },
  ]);
});
