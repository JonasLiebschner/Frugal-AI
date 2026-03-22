import assert from "node:assert/strict";
import test from "node:test";
import {
  StreamingAccumulator,
  buildStreamingRequestBody,
  detectStreamingKind,
  extractSseDataPayload,
  splitSseBlocks,
} from "../server/ai-proxy-routing";

test("detects forced streaming generation routes", () => {
  assert.equal(detectStreamingKind("POST", "/v1/chat/completions", { model: "demo" }), "chat.completions");
  assert.equal(detectStreamingKind("POST", "/v1/completions", { model: "demo" }), "completions");
  assert.equal(detectStreamingKind("POST", "/v1/embeddings", { model: "demo" }), undefined);
});

test("builds an upstream streaming body", () => {
  const body = JSON.parse(buildStreamingRequestBody({
    model: "demo",
    stream: false,
    max_tokens: 2048,
    max_completion_tokens: 4096,
    tools: [
      {
        type: "function",
        function: {
          name: "lookup_weather",
        },
      },
    ],
  }).toString("utf8")) as {
    model: string;
    stream: boolean;
    max_tokens?: number;
    max_completion_tokens?: number;
    tools?: unknown[];
  };

  assert.equal(body.model, "demo");
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, 2048);
  assert.equal(body.max_completion_tokens, 4096);
  assert.equal(body.tools?.length, 1);
});

test("splits SSE blocks and extracts payloads", () => {
  const split = splitSseBlocks("data: {\"a\":1}\n\ndata: [DONE]\n\n", false);
  assert.deepEqual(split.blocks, ["data: {\"a\":1}", "data: [DONE]"]);
  assert.equal(split.remainder, "");
  assert.equal(extractSseDataPayload(split.blocks[0] ?? ""), "{\"a\":1}");
});

test("accumulates chat streaming chunks into a final response", () => {
  const accumulator = new StreamingAccumulator("chat.completions");

  accumulator.applyPayload({
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 123,
    model: "demo",
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          content: "Hal",
        },
      },
    ],
  });

  const update = accumulator.applyPayload({
    choices: [
      {
        index: 0,
        delta: {
          content: "lo",
          reasoning_content: "thinking",
        },
      },
    ],
    timings: {
      prompt_n: 5,
      predicted_n: 2,
      predicted_ms: 80,
      predicted_per_second: 25,
    },
  });

  accumulator.applyPayload({
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        delta: {},
      },
    ],
  });

  assert.equal(update.metrics.completionTokens, 2);
  assert.equal(update.metrics.reasoningTokens, 1);

  const response = accumulator.buildResponse();
  assert.equal(response.object, "chat.completion");
  assert.deepEqual(response.choices, [
    {
      index: 0,
      finish_reason: "stop",
      message: {
        role: "assistant",
        content: "Hallo",
        reasoning_content: "thinking",
      },
    },
  ]);
  assert.deepEqual(response.usage, {
    prompt_tokens: 5,
    completion_tokens: 2,
    total_tokens: 7,
  });
});

test("accumulates multi tool call chunks into a final chat response", () => {
  const accumulator = new StreamingAccumulator("chat.completions");

  accumulator.applyPayload({
    id: "chatcmpl-tools-1",
    object: "chat.completion.chunk",
    created: 456,
    model: "demo-tools",
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
      },
    ],
  });

  accumulator.applyPayload({
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
      },
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 9,
      total_tokens: 21,
    },
  });

  accumulator.applyPayload({
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        delta: {},
      },
    ],
  });

  const response = accumulator.buildResponse();
  assert.equal(response.object, "chat.completion");
  assert.deepEqual(response.choices, [
    {
      index: 0,
      finish_reason: "tool_calls",
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
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
        ],
      },
    },
  ]);
  assert.deepEqual(response.usage, {
    prompt_tokens: 12,
    completion_tokens: 9,
    total_tokens: 21,
  });
});

test("caps accumulated streaming text to avoid unbounded heap growth", () => {
  const accumulator = new StreamingAccumulator("chat.completions");
  const longChunk = "x".repeat(140_000);

  accumulator.applyPayload({
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          content: longChunk,
          reasoning_content: longChunk,
        },
      },
    ],
  });

  accumulator.applyPayload({
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              function: {
                name: "chat_with_model",
                arguments: longChunk,
              },
            },
          ],
        },
      },
    ],
  });

  const response = accumulator.buildResponse();
  const message = (response.choices as Array<Record<string, any>>)[0]?.message as Record<string, any>;
  const toolArguments = message.tool_calls?.[0]?.function?.arguments as string;

  assert.match(String(message.content ?? ""), /\[proxy truncated to protect memory\]/);
  assert.match(String(message.reasoning_content ?? ""), /\[proxy truncated to protect memory\]/);
  assert.match(String(toolArguments ?? ""), /\[proxy truncated to protect memory\]/);
  assert.ok(String(message.content ?? "").length < 130_000);
  assert.ok(String(message.reasoning_content ?? "").length < 130_000);
  assert.ok(String(toolArguments ?? "").length < 35_000);
});
