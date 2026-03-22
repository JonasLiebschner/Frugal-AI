import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBackendRequestPlan,
  buildOllamaChatRequestBody,
  convertOllamaChunkToOpenAiChunk,
  getDefaultHealthPaths,
} from "../server/ai-proxy-routing";
import type { ConnectionConfig } from "../../shared/type-api";

test("uses connector-specific default health paths", () => {
  assert.deepEqual(getDefaultHealthPaths({ connector: "openai" }), ["/v1/models", "/health"]);
  assert.deepEqual(getDefaultHealthPaths({ connector: "ollama" }), ["/api/tags", "/v1/models"]);
  assert.deepEqual(getDefaultHealthPaths({ connector: "llama.cpp" }), ["/v1/models", "/health"]);
  assert.deepEqual(getDefaultHealthPaths({ connector: "ollama", healthPath: "/readyz" }), ["/readyz"]);
});

test("maps OpenAI chat fields to Ollama native chat request payloads", () => {
  const payload = JSON.parse(buildOllamaChatRequestBody({
    model: "qwen-native",
    stream: false,
    max_tokens: 128,
    temperature: 0.25,
    top_p: 0.9,
    stop: ["</s>"],
    messages: [
      { role: "system", content: "You are concise." },
      {
        role: "user",
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: "World" },
        ],
      },
    ],
  }, true).toString("utf8")) as Record<string, unknown>;

  assert.equal(payload.model, "qwen-native");
  assert.equal(payload.stream, true);
  assert.deepEqual(payload.messages, [
    { role: "system", content: "You are concise." },
    { role: "user", content: "Hello\n\nWorld" },
  ]);
  assert.deepEqual(payload.options, {
    num_predict: 128,
    temperature: 0.25,
    top_p: 0.9,
    stop: ["</s>"],
  });
});

test("maps OpenAI tool call argument strings to native Ollama argument objects", () => {
  const payload = JSON.parse(buildOllamaChatRequestBody({
    model: "qwen-native",
    stream: false,
    messages: [
      { role: "user", content: "Use the weather tool." },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_demo",
            type: "function",
            function: {
              name: "get_weather",
              arguments: "{\"city\":\"Berlin\",\"unit\":\"celsius\"}",
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_demo",
        name: "get_weather",
        content: "{\"temperature\":18,\"unit\":\"celsius\"}",
      },
    ],
  }, false).toString("utf8")) as Record<string, any>;

  assert.deepEqual(payload.messages, [
    { role: "user", content: "Use the weather tool." },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_demo",
          type: "function",
          function: {
            name: "get_weather",
            arguments: {
              city: "Berlin",
              unit: "celsius",
            },
          },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: "call_demo",
      name: "get_weather",
      content: "{\"temperature\":18,\"unit\":\"celsius\"}",
    },
  ]);
});

test("preserves malformed OpenAI tool call argument strings in an Ollama-compatible object payload", () => {
  const payload = JSON.parse(buildOllamaChatRequestBody({
    model: "qwen-native",
    stream: false,
    messages: [
      { role: "user", content: "Use the comparison tool." },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_bad",
            type: "function",
            function: {
              name: "chat_with_model",
              arguments:
                "{\"model\":\"qwen-a\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}{\"model\":\"qwen-b\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}",
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_bad",
        name: "chat_with_model",
        content: "{\"error\":{\"message\":\"The MCP tool \\\"chat_with_model\\\" received invalid arguments.\"}}",
      },
    ],
  }, false).toString("utf8")) as Record<string, any>;

  assert.deepEqual(payload.messages?.[1]?.tool_calls?.[0]?.function?.arguments, {
    __proxy_raw_arguments:
      "{\"model\":\"qwen-a\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}{\"model\":\"qwen-b\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}",
    __proxy_note: "Original tool arguments were not valid JSON.",
  });
});

test("translates native Ollama stream chunks into OpenAI-compatible chunks", () => {
  const chunk = convertOllamaChunkToOpenAiChunk({
    model: "qwen-native",
    created_at: "2026-03-13T11:11:00.000Z",
    message: {
      role: "assistant",
      content: "Hello",
      thinking: "Need one word.",
    },
    done: true,
    done_reason: "stop",
    prompt_eval_count: 12,
    prompt_eval_duration: 20_000_000,
    eval_count: 4,
    eval_duration: 40_000_000,
  }, "req-ollama");

  assert.equal(chunk?.object, "chat.completion.chunk");
  assert.equal(chunk?.model, "qwen-native");
  assert.deepEqual(chunk?.choices, [
    {
      index: 0,
      delta: {
        role: "assistant",
        content: "Hello",
        reasoning_content: "Need one word.",
      },
      finish_reason: "stop",
    },
  ]);
  assert.deepEqual(chunk?.usage, {
    prompt_tokens: 12,
    completion_tokens: 4,
    total_tokens: 16,
  });
  assert.deepEqual(chunk?.timings, {
    prompt_n: 12,
    predicted_n: 4,
    prompt_ms: 20,
    predicted_ms: 40,
    prompt_per_second: 600,
    predicted_per_second: 100,
  });
});

test("routes Ollama chat completions to the native /api/chat endpoint", () => {
  const backend: ConnectionConfig = {
    id: "ollama-test",
    name: "Ollama Test",
    baseUrl: "http://127.0.0.1:11434",
    connector: "ollama",
    enabled: true,
    maxConcurrency: 1,
  };

  const plan = buildBackendRequestPlan(
    backend,
    "POST",
    "/v1/chat/completions",
    "",
    Buffer.from("{}"),
    {
      model: "qwen-native",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
    },
    true,
  );

  assert.equal(plan.pathAndSearch, "/api/chat");
  assert.equal(plan.responseMode, "ollama-ndjson");
});

test("drops unsupported sampler fields before forwarding OpenAI chat requests", () => {
  const backend: ConnectionConfig = {
    id: "openai-test",
    name: "OpenAI Test",
    baseUrl: "https://api.openai.com",
    connector: "openai",
    enabled: true,
    maxConcurrency: 1,
  };

  const plan = buildBackendRequestPlan(
    backend,
    "POST",
    "/v1/chat/completions",
    "",
    Buffer.from("{}"),
    {
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      temperature: 0.7,
      top_p: 0.95,
      top_k: 40,
      min_p: 0.05,
      repeat_penalty: 1.1,
      max_tokens: 256,
    },
    true,
  );

  const payload = JSON.parse((plan.body ?? Buffer.from("{}")).toString("utf8")) as Record<string, unknown>;

  assert.equal(plan.pathAndSearch, "/v1/chat/completions");
  assert.equal(plan.responseMode, "openai-sse");
  assert.equal(payload.stream, true);
  assert.equal(payload.temperature, 0.7);
  assert.equal(payload.top_p, 0.95);
  assert.equal(payload.max_tokens, 256);
  assert.equal("max_completion_tokens" in payload, false);
  assert.equal("top_k" in payload, false);
  assert.equal("min_p" in payload, false);
  assert.equal("repeat_penalty" in payload, false);
});

test("preserves explicit token limit fields for OpenAI chat requests", () => {
  const backend: ConnectionConfig = {
    id: "openai-test",
    name: "OpenAI Test",
    baseUrl: "https://api.openai.com",
    connector: "openai",
    enabled: true,
    maxConcurrency: 1,
  };

  const plan = buildBackendRequestPlan(
    backend,
    "POST",
    "/v1/chat/completions",
    "",
    Buffer.from("{}"),
    {
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      max_tokens: 256,
      max_completion_tokens: 128,
    },
    false,
  );

  const payload = JSON.parse((plan.body ?? Buffer.from("{}")).toString("utf8")) as Record<string, unknown>;

  assert.equal(plan.responseMode, "raw");
  assert.equal(payload.max_completion_tokens, 128);
  assert.equal(payload.max_tokens, 256);
});

test("preserves llama.cpp sampler fields on the OpenAI-compatible chat route", () => {
  const backend: ConnectionConfig = {
    id: "llamacpp-test",
    name: "llama.cpp Test",
    baseUrl: "http://127.0.0.1:8081",
    connector: "llama.cpp",
    enabled: true,
    maxConcurrency: 1,
  };

  const plan = buildBackendRequestPlan(
    backend,
    "POST",
    "/v1/chat/completions",
    "",
    Buffer.from("{}"),
    {
      model: "qwen-local",
      messages: [{ role: "user", content: "Hi" }],
      stream: false,
      temperature: 0.7,
      top_p: 0.95,
      top_k: 40,
      min_p: 0.05,
      repeat_penalty: 1.1,
      max_tokens: 256,
    },
    true,
  );

  const payload = JSON.parse((plan.body ?? Buffer.from("{}")).toString("utf8")) as Record<string, unknown>;

  assert.equal(plan.pathAndSearch, "/v1/chat/completions");
  assert.equal(plan.responseMode, "openai-sse");
  assert.equal(payload.stream, true);
  assert.equal(payload.top_k, 40);
  assert.equal(payload.min_p, 0.05);
  assert.equal(payload.repeat_penalty, 1.1);
});
