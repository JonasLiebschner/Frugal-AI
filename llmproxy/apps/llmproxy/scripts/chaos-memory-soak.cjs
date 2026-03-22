const assert = require("node:assert/strict");
const { fork } = require("node:child_process");
const { randomInt, randomUUID } = require("node:crypto");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { Agent: HttpAgent, createServer, get: httpGet, request: httpRequest } = require("node:http");
const { createServer: createNetServer } = require("node:net");
const { tmpdir } = require("node:os");
const path = require("node:path");

const { loadTestRuntime } = require("./load-test-runtime.cjs");

const CHAOS_DURATION_MS = 20_000;
const SAMPLE_INTERVAL_MS = 500;
const MAX_CHAOS_RECENT_DETAIL_BYTES = 3_500_000;
const MAX_ACTIVE_STREAM_RECENT_DETAIL_BYTES = 18_000_000;
const MAX_FINAL_HEAP_GROWTH_MB = 70;
const MAX_SSE_BUFFER_BYTES = 12_000_000;
const ACTIVE_STREAM_CLIENT_AGENT = new HttpAgent({
  keepAlive: false,
  maxSockets: 1_024,
});

function readCliOption(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function hasCliFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function parsePositiveInteger(value, fallback) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const RUN_MODE = readCliOption("mode") ?? "chaos";
const ACTIVE_STREAM_CONNECTIONS = parsePositiveInteger(readCliOption("connections"), 500);
const ACTIVE_STREAM_MIN_TOKENS = parsePositiveInteger(readCliOption("min-tokens"), 1_000);
const ACTIVE_STREAM_MAX_TOKENS = parsePositiveInteger(readCliOption("max-tokens"), 40_000);
const REQUESTED_PROXY_PORT = parsePositiveInteger(readCliOption("proxy-port"), 0);
const HOLD_OPEN_AFTER_RUN = hasCliFlag("hold-open");

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

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function forceGc() {
  if (typeof global.gc !== "function") {
    return;
  }

  for (let index = 0; index < 4; index += 1) {
    global.gc();
    await delay(25);
  }
}

function toMb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function memorySnapshot() {
  const usage = process.memoryUsage();
  return {
    heapUsedMb: toMb(usage.heapUsed),
    rssMb: toMb(usage.rss),
    externalMb: toMb(usage.external),
    arrayBuffersMb: toMb(usage.arrayBuffers),
  };
}

async function waitForCondition(check, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) {
      return;
    }

    await delay(50);
  }

  throw new Error(message);
}

function pickWeighted(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.random() * total;

  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor <= 0) {
      return entry.value;
    }
  }

  return entries[entries.length - 1]?.value;
}

function incrementCounter(container, key, delta = 1) {
  container[key] = (container[key] ?? 0) + delta;
}

function createLargeText(label, characters) {
  const seed = `${label}-`;
  let text = "";
  while (text.length < characters) {
    text += seed;
  }

  return text.slice(0, characters);
}

function createLongPrompt(mode, requestIndex) {
  return [
    `[chaos:${mode}] request=${requestIndex}`,
    createLargeText(`prompt-${mode}-${requestIndex}`, 18_000),
  ].join("\n");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readRequestedTargetTokens(payload) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const value = payload.chaos_target_tokens;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function readRequestedChunkDelayMs(payload) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const value = payload.chaos_chunk_delay_ms;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function buildRequestedStreamPlan(targetCompletionTokens, requestedChunkDelayMs) {
  const segmentCount = clamp(Math.ceil(targetCompletionTokens / 320), 24, 160);
  const contentSize = clamp(Math.round(targetCompletionTokens / 36), 240, 1_200);
  const reasoningSize = clamp(Math.round(contentSize / 2), 120, 700);
  const chunkDelayMs = requestedChunkDelayMs ?? clamp(Math.round(4_000 / segmentCount), 8, 40);

  return {
    targetCompletionTokens,
    segmentCount,
    contentSize,
    reasoningSize,
    chunkDelayMs,
  };
}

function inspectRetainedActiveStreamDetail(loadBalancer) {
  const recentRequests = loadBalancer.getSnapshot().recentRequests ?? [];
  const sampleEntry =
    recentRequests.find((entry) => entry.outcome === "success" && entry.hasDetail && entry.requestType === "json") ??
    recentRequests.find((entry) => entry.outcome === "success" && entry.hasDetail);

  if (!sampleEntry) {
    return {
      sample: null,
      verdicts: ["active-streams run did not retain a successful request detail sample"],
    };
  }

  const detail = loadBalancer.getRequestLogDetail(sampleEntry.id);
  const requestBody = detail?.requestBody;
  const responseBody = detail?.responseBody;
  const targetTokens = readRequestedTargetTokens(requestBody);
  const chunkDelayMs = readRequestedChunkDelayMs(requestBody);
  const streamPlan = targetTokens ? buildRequestedStreamPlan(targetTokens, chunkDelayMs) : undefined;
  const content = Array.isArray(responseBody?.choices)
    ? responseBody.choices?.[0]?.message?.content
    : undefined;
  const verdicts = [];

  if (!detail || !requestBody || !responseBody) {
    verdicts.push(`retained detail sample ${sampleEntry.id} was missing request or response data`);
  }

  if (!streamPlan) {
    verdicts.push(`retained detail sample ${sampleEntry.id} did not expose chaos_target_tokens`);
  }

  if (typeof content !== "string") {
    verdicts.push(`retained detail sample ${sampleEntry.id} had no assistant content`);
  }

  if (typeof content === "string") {
    if (content.includes("truncated to reduce memory usage") || content.includes("truncated to protect memory")) {
      verdicts.push(`retained detail sample ${sampleEntry.id} still contained a truncation marker`);
    }

    if (streamPlan) {
      const expectedContentLength = streamPlan.segmentCount * streamPlan.contentSize;
      if (content.length !== expectedContentLength) {
        verdicts.push(
          `retained detail sample ${sampleEntry.id} stored ${content.length} bytes instead of ${expectedContentLength}`,
        );
      }
    }
  }

  return {
    sample: {
      requestId: sampleEntry.id,
      requestType: sampleEntry.requestType,
      targetTokens: targetTokens ?? 0,
      expectedContentLength: streamPlan ? streamPlan.segmentCount * streamPlan.contentSize : 0,
      retainedContentLength: typeof content === "string" ? content.length : 0,
    },
    verdicts,
  };
}

function extractChaosMode(payload) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }

    const content = message.content;
    if (typeof content === "string") {
      const match = content.match(/\[chaos:([a-z0-9_-]+)\]/i);
      if (match?.[1]) {
        return match[1].toLowerCase();
      }
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part || typeof part !== "object") {
          continue;
        }

        if (typeof part.text === "string") {
          const match = part.text.match(/\[chaos:([a-z0-9_-]+)\]/i);
          if (match?.[1]) {
            return match[1].toLowerCase();
          }
        }
      }
    }
  }

  return undefined;
}

function createModelMetadata(profileName) {
  return {
    profile: profileName,
    aliases: ["chaos-shared-model"],
    limits: {
      max_completion_tokens: 8192,
    },
    fields: Object.fromEntries(
      Array.from({ length: 80 }, (_, index) => [`field_${index}`, createLargeText(`${profileName}-meta-${index}`, 128)]),
    ),
  };
}

function buildOpenAiModelsPayload(profileName, supportedModels) {
  return {
    object: "list",
    data: supportedModels.map((model) => ({
      id: model,
      object: "model",
      created: 0,
      owned_by: profileName,
      metadata: createModelMetadata(profileName),
    })),
  };
}

function buildOllamaModelsPayload(profileName, supportedModels) {
  return {
    models: supportedModels.map((model) => ({
      name: model,
      model,
      modified_at: "2026-03-15T12:00:00.000Z",
      size: 123456789,
      details: {
        family: "chaos",
        format: "gguf",
      },
      metadata: createModelMetadata(profileName),
    })),
  };
}

function chooseOpenAiScenario(profileName, explicitMode) {
  if (profileName.startsWith("stream-bulk")) {
    return "long";
  }

  if (explicitMode) {
    if (explicitMode === "toolstorm") {
      return "toolstorm";
    }

    if (explicitMode === "drop") {
      return "drop";
    }

    if (explicitMode === "hang") {
      return "hang";
    }

    if (explicitMode === "error") {
      return "error";
    }

    if (explicitMode === "duplicate") {
      return "duplicate";
    }

    if (explicitMode === "noisy") {
      return "noisy";
    }
  }

  if (profileName === "openai-chaos") {
    return pickWeighted([
      { value: "long", weight: 24 },
      { value: "toolstorm", weight: 16 },
      { value: "noisy", weight: 16 },
      { value: "duplicate", weight: 8 },
      { value: "drop", weight: 14 },
      { value: "error", weight: 12 },
      { value: "hang", weight: 10 },
    ]);
  }

  if (profileName === "openai-slow") {
    return pickWeighted([
      { value: "long", weight: 55 },
      { value: "duplicate", weight: 25 },
      { value: "noisy", weight: 10 },
      { value: "error", weight: 10 },
    ]);
  }

  return pickWeighted([
    { value: "long", weight: 60 },
    { value: "toolstorm", weight: 20 },
    { value: "duplicate", weight: 10 },
    { value: "noisy", weight: 10 },
  ]);
}

function chooseOllamaScenario(explicitMode) {
  if (explicitMode === "drop") {
    return "drop";
  }

  if (explicitMode === "hang") {
    return "hang";
  }

  if (explicitMode === "error") {
    return "error";
  }

  if (explicitMode === "noisy") {
    return "noisy";
  }

  return pickWeighted([
    { value: "long", weight: 50 },
    { value: "noisy", weight: 20 },
    { value: "drop", weight: 12 },
    { value: "error", weight: 10 },
    { value: "hang", weight: 8 },
  ]);
}

function buildOpenAiLongChunks(model, requestId, options = {}) {
  const chunks = [];
  const segmentCount = options.segmentCount ?? 36;
  const reasoningEvery = options.reasoningEvery ?? 4;
  const contentSize = options.contentSize ?? 1_600;
  const reasoningSize = options.reasoningSize ?? 900;
  const targetCompletionTokens = options.targetCompletionTokens ?? segmentCount;
  const promptTokens = options.promptTokens ?? 512;
  const chunkDelayMs = options.chunkDelayMs ?? 0;

  for (let index = 0; index < segmentCount; index += 1) {
    const delta = {};
    const progressTokens = clamp(
      Math.round((((index + 1) / segmentCount) * targetCompletionTokens)),
      1,
      targetCompletionTokens,
    );
    const elapsedMs = Math.max(1, (index + 1) * Math.max(1, chunkDelayMs));

    if (index === 0) {
      delta.role = "assistant";
    }

    delta.content = createLargeText(`out-${requestId}-${index}`, contentSize);
    if (index % reasoningEvery === 0) {
      delta.reasoning_content = createLargeText(`think-${requestId}-${index}`, reasoningSize);
    }

    chunks.push({
      id: `chatcmpl-chaos-${requestId}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      timings: {
        prompt_n: promptTokens,
        predicted_n: progressTokens,
        predicted_ms: elapsedMs,
        predicted_per_second: Math.round((progressTokens / (elapsedMs / 1000)) * 10) / 10,
      },
      choices: [
        {
          index: 0,
          delta,
          finish_reason: null,
        },
      ],
    });
  }

  chunks.push({
    id: `chatcmpl-chaos-${requestId}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: targetCompletionTokens,
      total_tokens: promptTokens + targetCompletionTokens,
    },
  });

  return chunks;
}

function buildOpenAiToolstormChunks(model, requestId) {
  const firstToolCalls = [];
  const secondToolCalls = [];

  for (let index = 0; index < 48; index += 1) {
    firstToolCalls.push({
      index,
      id: `tool_${index}`,
      type: "function",
      function: {
        name: `chaos_tool_${index}`,
        arguments: `{"slot":${index},"payload":"${createLargeText(`tool-a-${index}`, 900)}`,
      },
    });

    secondToolCalls.push({
      index,
      function: {
        arguments: `"tail":"${createLargeText(`tool-b-${index}`, 700)}"}`,
      },
    });
  }

  return [
    {
      id: `chatcmpl-chaos-${requestId}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: firstToolCalls,
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: `chatcmpl-chaos-${requestId}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: secondToolCalls,
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: `chatcmpl-chaos-${requestId}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "tool_calls",
        },
      ],
      usage: {
        prompt_tokens: 420,
        completion_tokens: 96,
        total_tokens: 516,
      },
    },
  ];
}

async function writeOpenAiStream(response, chunks, stats, options = {}) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });

  for (let index = 0; index < chunks.length; index += 1) {
    if (options.interleaveNoise && index % 3 === 0) {
      response.write(": backend ping\n\n");
      response.write("data: {broken json\n\n");
      incrementCounter(stats.scenarios, "invalid_chunks");
    }

    response.write(`data: ${JSON.stringify(chunks[index])}\n\n`);
    incrementCounter(stats.scenarios, "stream_chunks");

    if (options.duplicateFirstChunk && index === 0) {
      response.write(`data: ${JSON.stringify(chunks[index])}\n\n`);
      incrementCounter(stats.scenarios, "duplicated_chunks");
    }

    if (options.delayMs) {
      await delay(options.delayMs);
    } else if (options.slow) {
      await delay(35);
    }
  }

  response.end("data: [DONE]\n\n");
}

async function handleOpenAiScenario(response, payload, stats, profileName) {
  const explicitMode = extractChaosMode(payload);
  const scenario = chooseOpenAiScenario(profileName, explicitMode);
  const model = typeof payload.model === "string" && payload.model.length > 0 ? payload.model : "chaos-shared-model";
  const requestId = randomUUID();
  const requestedTargetTokens = readRequestedTargetTokens(payload);
  const requestedChunkDelayMs = readRequestedChunkDelayMs(payload);
  const requestedStreamPlan = requestedTargetTokens
    ? buildRequestedStreamPlan(requestedTargetTokens, requestedChunkDelayMs)
    : undefined;
  incrementCounter(stats.scenarios, scenario);

  if (scenario === "error") {
    response.writeHead(500, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({
      error: {
        message: createLargeText(`${profileName}-error-${requestId}`, 18_000),
        type: "backend_chaos",
      },
    }));
    return;
  }

  if (scenario === "hang") {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    response.write(`data: ${JSON.stringify(buildOpenAiLongChunks(model, requestId, { segmentCount: 2 })[0])}\n\n`);
    incrementCounter(stats.scenarios, "stream_chunks");
    return;
  }

  if (scenario === "drop") {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });

    const chunks = buildOpenAiLongChunks(model, requestId, {
      segmentCount: requestedStreamPlan?.segmentCount ?? 10,
      targetCompletionTokens: requestedStreamPlan?.targetCompletionTokens,
      contentSize: requestedStreamPlan?.contentSize,
      reasoningSize: requestedStreamPlan?.reasoningSize,
      chunkDelayMs: requestedStreamPlan?.chunkDelayMs,
    });
    for (let index = 0; index < 5; index += 1) {
      response.write(`data: ${JSON.stringify(chunks[index])}\n\n`);
      incrementCounter(stats.scenarios, "stream_chunks");
      await delay(25);
    }

    response.socket?.destroy(new Error("Chaos backend dropped the upstream SSE connection."));
    return;
  }

  if (scenario === "toolstorm") {
    await writeOpenAiStream(response, buildOpenAiToolstormChunks(model, requestId), stats, {
      slow: profileName === "openai-slow",
    });
    return;
  }

  await writeOpenAiStream(response, buildOpenAiLongChunks(model, requestId, {
    segmentCount: requestedStreamPlan?.segmentCount ?? (scenario === "duplicate" ? 24 : 40),
    reasoningEvery: scenario === "noisy" ? 2 : 4,
    targetCompletionTokens: requestedStreamPlan?.targetCompletionTokens,
    contentSize: requestedStreamPlan?.contentSize,
    reasoningSize: requestedStreamPlan?.reasoningSize,
    chunkDelayMs: requestedStreamPlan?.chunkDelayMs,
  }), stats, {
    interleaveNoise: scenario === "noisy",
    duplicateFirstChunk: scenario === "duplicate",
    slow: profileName === "openai-slow",
    delayMs: requestedStreamPlan?.chunkDelayMs,
  });
}

async function writeOllamaStream(response, lines, stats, options = {}) {
  response.writeHead(200, {
    "content-type": "application/x-ndjson",
  });

  for (let index = 0; index < lines.length; index += 1) {
    if (options.interleaveNoise && index % 3 === 1) {
      response.write("{broken json}\n");
      incrementCounter(stats.scenarios, "invalid_chunks");
    }

    response.write(`${JSON.stringify(lines[index])}\n`);
    incrementCounter(stats.scenarios, "stream_chunks");

    if (options.slow) {
      await delay(35);
    }
  }

  response.end();
}

function buildOllamaLines(model, scenario, requestId) {
  const lines = [];
  const count = scenario === "long" ? 32 : 18;

  for (let index = 0; index < count; index += 1) {
    lines.push({
      model,
      created_at: new Date(Date.now() + (index * 50)).toISOString(),
      message: {
        role: "assistant",
        content: createLargeText(`ollama-${requestId}-${index}`, 1_400),
        thinking: index % 3 === 0 ? createLargeText(`ollama-think-${requestId}-${index}`, 700) : "",
      },
      done: false,
    });
  }

  lines.push({
    model,
    created_at: new Date().toISOString(),
    message: {
      role: "assistant",
      content: "",
    },
    done: true,
    done_reason: "stop",
    prompt_eval_count: 384,
    eval_count: count,
    prompt_eval_duration: 12_000_000,
    eval_duration: 180_000_000,
  });

  return lines;
}

async function handleOllamaScenario(response, payload, stats) {
  const explicitMode = extractChaosMode(payload);
  const scenario = chooseOllamaScenario(explicitMode);
  const model = typeof payload.model === "string" && payload.model.length > 0 ? payload.model : "chaos-shared-model";
  const requestId = randomUUID();
  incrementCounter(stats.scenarios, scenario);

  if (scenario === "error") {
    response.writeHead(500, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({
      error: createLargeText(`ollama-error-${requestId}`, 12_000),
    }));
    return;
  }

  if (scenario === "hang") {
    response.writeHead(200, {
      "content-type": "application/x-ndjson",
    });
    response.write(`${JSON.stringify(buildOllamaLines(model, "long", requestId)[0])}\n`);
    incrementCounter(stats.scenarios, "stream_chunks");
    return;
  }

  if (scenario === "drop") {
    response.writeHead(200, {
      "content-type": "application/x-ndjson",
    });
    const lines = buildOllamaLines(model, "drop", requestId);
    for (let index = 0; index < 5; index += 1) {
      response.write(`${JSON.stringify(lines[index])}\n`);
      incrementCounter(stats.scenarios, "stream_chunks");
      await delay(25);
    }

    response.socket?.destroy(new Error("Chaos backend dropped the upstream NDJSON connection."));
    return;
  }

  await writeOllamaStream(response, buildOllamaLines(model, scenario, requestId), stats, {
    interleaveNoise: scenario === "noisy",
    slow: false,
  });
}

async function startChaosBackend(definition) {
  const stats = {
    connector: definition.connector,
    profile: definition.profile,
    requests: 0,
    healthChecks: 0,
    healthFailures: 0,
    scenarios: {},
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method?.toUpperCase() ?? "GET";
    server.keepAliveTimeout = 5_000;

    if (definition.connector === "openai" && method === "GET" && url.pathname === "/v1/models") {
      stats.healthChecks += 1;

      if (definition.profile === "openai-chaos" && stats.healthChecks % 7 === 0) {
        stats.healthFailures += 1;
        response.writeHead(503, {
          "content-type": "application/json; charset=utf-8",
        });
        response.end(JSON.stringify({
          error: {
            message: "Synthetic health check failure.",
            type: "health_chaos",
          },
        }));
        return;
      }

      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify(buildOpenAiModelsPayload(definition.profile, definition.models)));
      return;
    }

    if (definition.connector === "ollama" && method === "GET" && url.pathname === "/api/tags") {
      stats.healthChecks += 1;
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify(buildOllamaModelsPayload(definition.profile, definition.models)));
      return;
    }

    if (definition.connector === "openai" && method === "POST" && url.pathname === "/v1/chat/completions") {
      stats.requests += 1;
      const body = await readRequestBody(request);
      const payload = JSON.parse(body.toString("utf8"));
      await handleOpenAiScenario(response, payload, stats, definition.profile);
      return;
    }

    if (definition.connector === "ollama" && method === "POST" && url.pathname === "/api/chat") {
      stats.requests += 1;
      const body = await readRequestBody(request);
      const payload = JSON.parse(body.toString("utf8"));
      await handleOllamaScenario(response, payload, stats);
      return;
    }

    response.writeHead(404, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({
      error: {
        message: `Unhandled chaos backend route ${method} ${url.pathname}`,
        type: "invalid_request_error",
      },
    }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(definition.port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    server,
    stats,
    config: {
      id: definition.id,
      name: definition.profile,
      baseUrl: `http://127.0.0.1:${definition.port}`,
      connector: definition.connector,
      enabled: true,
      maxConcurrency: definition.maxConcurrency,
      healthPath: definition.connector === "ollama" ? "/api/tags" : "/v1/models",
      models: definition.models,
      timeoutMs: definition.timeoutMs,
    },
  };
}

function chooseClientScenario(kind) {
  if (kind === "json") {
    return pickWeighted([
      { value: "long", weight: 35 },
      { value: "toolstorm", weight: 20 },
      { value: "duplicate", weight: 12 },
      { value: "noisy", weight: 10 },
      { value: "error", weight: 13 },
      { value: "hang", weight: 10 },
    ]);
  }

  if (kind === "stream") {
    return pickWeighted([
      { value: "long", weight: 40 },
      { value: "toolstorm", weight: 18 },
      { value: "duplicate", weight: 14 },
      { value: "noisy", weight: 14 },
      { value: "drop", weight: 8 },
      { value: "hang", weight: 6 },
    ]);
  }

  return pickWeighted([
    { value: "drop", weight: 28 },
    { value: "hang", weight: 18 },
    { value: "long", weight: 18 },
    { value: "noisy", weight: 18 },
    { value: "toolstorm", weight: 18 },
  ]);
}

function chooseClientModel() {
  return pickWeighted([
    { value: "auto", weight: 30 },
    { value: "chaos-shared-model", weight: 40 },
    { value: "chaos-openai-model", weight: 15 },
    { value: "chaos-ollama-model", weight: 15 },
  ]);
}

function createClientPayload(kind, mode, requestIndex) {
  const model = chooseClientModel();
  const messages = [
    {
      role: "system",
      content: createLongPrompt(mode, requestIndex),
    },
    {
      role: "user",
      content: createLargeText(`user-${kind}-${mode}-${requestIndex}`, kind === "json" ? 10_000 : 7_500),
    },
  ];

  return {
    model,
    stream: kind !== "json",
    max_completion_tokens: 2048,
    messages,
    tools: Array.from({ length: 8 }, (_, index) => ({
      type: "function",
      function: {
        name: `client_tool_${index}`,
        description: createLargeText(`tool-desc-${requestIndex}-${index}`, 220),
        parameters: {
          type: "object",
          properties: {
            payload: {
              type: "string",
            },
          },
        },
      },
    })),
  };
}

function createRequestedStreamPayload(requestIndex, targetTokens, chunkDelayMs) {
  return {
    model: requestIndex % 5 === 0 ? "auto" : "chaos-shared-model",
    stream: true,
    max_completion_tokens: targetTokens,
    messages: [
      {
        role: "system",
        content: `[chaos:long] active-stream request=${requestIndex} target_tokens=${targetTokens}`,
      },
      {
        role: "user",
        content: `Keep streaming until the proxy has relayed a long response for soak request ${requestIndex}.`,
      },
    ],
    chaos_target_tokens: targetTokens,
    chaos_chunk_delay_ms: chunkDelayMs,
  };
}

async function sendChatRequest(baseUrl, payload, stats) {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const requestId = response.headers.get("x-ai-proxy-request-id") ?? undefined;
  incrementCounter(stats.statusCodes, String(response.status));

  return {
    response,
    requestId,
  };
}

async function sendChatRequestOverHttp(baseUrl, payload, stats) {
  const url = new URL("/v1/chat/completions", baseUrl);
  const body = JSON.stringify(payload);

  return await new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method: "POST",
      agent: ACTIVE_STREAM_CLIENT_AGENT,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      const requestIdHeader = response.headers["x-ai-proxy-request-id"];
      incrementCounter(stats.statusCodes, String(statusCode));
      resolve({
        response,
        statusCode,
        requestId: Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader,
      });
    });

    request.once("error", reject);
    request.end(body);
  });
}

async function runJsonClient(baseUrl, stats, requestIndex) {
  const mode = chooseClientScenario("json");
  const payload = createClientPayload("json", mode, requestIndex);
  incrementCounter(stats.operations, "json");

  try {
    const { response, requestId } = await sendChatRequest(baseUrl, payload, stats);
    const body = await response.text();
    stats.bytesReceived += Buffer.byteLength(body);
    if (requestId) {
      stats.requestIds.push(requestId);
    }

    if (response.status === 200) {
      const parsed = JSON.parse(body);
      assert.equal(typeof parsed, "object");
      incrementCounter(stats.results, "success");
    } else {
      incrementCounter(stats.results, "error");
    }
  } catch (error) {
    incrementCounter(stats.results, "error");
    incrementCounter(stats.errors, error?.name ?? "unknown");
  }
}

async function runStreamingClient(baseUrl, stats, requestIndex) {
  const mode = chooseClientScenario("stream");
  const payload = createClientPayload("stream", mode, requestIndex);
  incrementCounter(stats.operations, "stream");

  try {
    const { response, requestId } = await sendChatRequest(baseUrl, payload, stats);
    const reader = response.body?.getReader();
    if (requestId) {
      stats.requestIds.push(requestId);
    }

    let receivedBytes = 0;
    while (reader) {
      const next = await reader.read();
      if (next.done) {
        break;
      }

      receivedBytes += next.value.length;
      stats.bytesReceived += next.value.length;
      stats.streamChunks += 1;
    }

    if (response.status === 200) {
      incrementCounter(stats.results, "success");
    } else {
      incrementCounter(stats.results, "error");
    }

    if (receivedBytes === 0 && response.status === 200) {
      incrementCounter(stats.results, "empty_stream");
    }
  } catch (error) {
    incrementCounter(stats.results, "error");
    incrementCounter(stats.errors, error?.name ?? "unknown");
  }
}

async function runAbortingStreamingClient(baseUrl, stats, requestIndex) {
  const mode = chooseClientScenario("abort");
  const payload = createClientPayload("stream", mode, requestIndex);
  incrementCounter(stats.operations, "stream_abort");

  try {
    const { response, requestId } = await sendChatRequest(baseUrl, {
      ...payload,
      stream: true,
    }, stats);
    if (requestId) {
      stats.requestIds.push(requestId);
    }

    const reader = response.body?.getReader();
    let receivedBytes = 0;
    while (reader) {
      const next = await reader.read();
      if (next.done) {
        break;
      }

      receivedBytes += next.value.length;
      stats.bytesReceived += next.value.length;
      stats.streamChunks += 1;

      if (receivedBytes > 9_000) {
        await reader.cancel().catch(() => undefined);
        incrementCounter(stats.results, "aborted");
        return;
      }
    }

    incrementCounter(stats.results, response.status === 200 ? "success" : "error");
  } catch (error) {
    incrementCounter(stats.results, "error");
    incrementCounter(stats.errors, error?.name ?? "unknown");
  }
}

function openStalledDashboardConnection(baseUrl) {
  return new Promise((resolve, reject) => {
    const request = httpGet(`${baseUrl}/api/llmproxy/admin/events`, (response) => {
      response.pause();
      resolve({
        request,
        response,
      });
    });

    request.once("error", reject);
  });
}

async function runDashboardChurnClient(baseUrl, stats) {
  incrementCounter(stats.operations, "dashboard_churn");
  const controller = new AbortController();

  try {
    const response = await fetch(`${baseUrl}/api/llmproxy/admin/events`, {
      signal: controller.signal,
    });
    const reader = response.body?.getReader();
    const deadline = Date.now() + 600;
    let receivedBytes = 0;

    while (reader && Date.now() < deadline) {
      const next = await Promise.race([
        reader.read(),
        delay(80).then(() => null),
      ]);
      if (!next) {
        continue;
      }

      if (next.done) {
        break;
      }

      receivedBytes += next.value.length;
      stats.bytesReceived += next.value.length;
      if (receivedBytes > 8_000) {
        break;
      }
    }

    controller.abort();
    if (reader) {
      await reader.cancel().catch(() => undefined);
    }
    incrementCounter(stats.results, "dashboard_closed");
  } catch (error) {
    incrementCounter(stats.errors, error?.name ?? "unknown");
  }
}

async function runDashboardStallClient(baseUrl, stats, pendingConnections) {
  incrementCounter(stats.operations, "dashboard_stall");

  try {
    const connection = await openStalledDashboardConnection(baseUrl);
    pendingConnections.add(connection);
    incrementCounter(stats.results, "dashboard_stalled");
    await delay(900);
    connection.request.destroy();
    connection.response.destroy();
    pendingConnections.delete(connection);
  } catch (error) {
    incrementCounter(stats.errors, error?.name ?? "unknown");
  }
}

async function runDashboardPoller(baseUrl, stats) {
  incrementCounter(stats.operations, "dashboard_poll");

  try {
    const stateResponse = await fetch(`${baseUrl}/api/llmproxy/admin/state`);
    const state = await stateResponse.json();
    incrementCounter(stats.statusCodes, `state-${stateResponse.status}`);
    const recentRequests = Array.isArray(state.recentRequests) ? state.recentRequests : [];
    const selected = recentRequests.slice(0, 3);

    for (const entry of selected) {
      if (!entry?.id) {
        continue;
      }

      const detailResponse = await fetch(`${baseUrl}/api/llmproxy/admin/requests/${encodeURIComponent(entry.id)}`);
      incrementCounter(stats.statusCodes, `detail-${detailResponse.status}`);
      await detailResponse.arrayBuffer();

      const diagnosticsResponse = await fetch(`${baseUrl}/api/llmproxy/admin/diagnostics/requests/${encodeURIComponent(entry.id)}`);
      incrementCounter(stats.statusCodes, `diagnostics-${diagnosticsResponse.status}`);
      await diagnosticsResponse.arrayBuffer();
    }
  } catch (error) {
    incrementCounter(stats.errors, error?.name ?? "unknown");
  }
}

function startMemorySampler(server, loadBalancer, clientStats) {
  const startedAt = Date.now();
  const samples = [];
  const timer = setInterval(() => {
    const memory = memorySnapshot();
    const snapshot = loadBalancer.getSnapshot();
    const recentRequestDetails = loadBalancer.recentRequestDetails;
    const retainedDetailBytes = Array.from(recentRequestDetails.values()).reduce((sum, detail) => (
      sum + Buffer.byteLength(JSON.stringify(detail))
    ), 0);
    const activeConnections = server.listActiveConnections();
    const sseBufferedBytes = server.getSseBufferedBytes();
    let queuedConnections = 0;
    let connectedConnections = 0;
    let streamingConnections = 0;

    for (const connection of activeConnections) {
      if (connection.phase === "queued") {
        queuedConnections += 1;
      } else if (connection.phase === "connected") {
        connectedConnections += 1;
      } else if (connection.phase === "streaming") {
        streamingConnections += 1;
      }
    }

    samples.push({
      elapsedMs: Date.now() - startedAt,
      heapUsedMb: memory.heapUsedMb,
      rssMb: memory.rssMb,
      externalMb: memory.externalMb,
      arrayBuffersMb: memory.arrayBuffersMb,
      activeConnections: activeConnections.length,
      queuedConnections,
      connectedConnections,
      streamingConnections,
      queueDepth: snapshot.queueDepth,
      activeSseClients: server.getDashboardSseClientCount(),
      sseBufferedBytes,
      retainedDetailBytes,
      retainedRequestCount: recentRequestDetails.size,
      totalClientBytesReceived: clientStats.bytesReceived,
      clientStreamChunks: clientStats.streamChunks,
    });
  }, SAMPLE_INTERVAL_MS);

  return {
    samples,
    stop() {
      clearInterval(timer);
    },
  };
}

async function runWorkerLoop(worker, deadline) {
  let index = 0;
  while (Date.now() < deadline) {
    await worker(index);
    index += 1;
  }
}

function createClientStats() {
  return {
    operations: {},
    results: {},
    statusCodes: {},
    errors: {},
    bytesReceived: 0,
    streamChunks: 0,
    requestIds: [],
  };
}

function mergeCounterMaps(target, source) {
  if (!source || typeof source !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "number") {
      continue;
    }

    target[key] = (target[key] ?? 0) + value;
  }
}

function mergeClientStats(target, source) {
  mergeCounterMaps(target.operations, source?.operations);
  mergeCounterMaps(target.results, source?.results);
  mergeCounterMaps(target.statusCodes, source?.statusCodes);
  mergeCounterMaps(target.errors, source?.errors);
  target.bytesReceived += source?.bytesReceived ?? 0;
  target.streamChunks += source?.streamChunks ?? 0;

  if (Array.isArray(source?.requestIds) && source.requestIds.length > 0) {
    target.requestIds.push(...source.requestIds);
  }
}

function buildChaosBackendDefinitions() {
  return [
    {
      id: "chaos-openai-stable",
      profile: "openai-stable",
      connector: "openai",
      models: ["chaos-shared-model", "chaos-openai-model"],
      models: ["chaos-*"],
      maxConcurrency: 3,
      timeoutMs: 2_500,
    },
    {
      id: "chaos-openai-chaos",
      profile: "openai-chaos",
      connector: "openai",
      models: ["chaos-shared-model", "chaos-openai-model"],
      models: ["chaos-*"],
      maxConcurrency: 2,
      timeoutMs: 2_500,
    },
    {
      id: "chaos-openai-slow",
      profile: "openai-slow",
      connector: "openai",
      models: ["chaos-shared-model", "chaos-slow-model"],
      models: ["chaos-*"],
      maxConcurrency: 2,
      timeoutMs: 3_000,
    },
    {
      id: "chaos-ollama",
      profile: "ollama-chaos",
      connector: "ollama",
      models: ["chaos-shared-model", "chaos-ollama-model"],
      models: ["chaos-*"],
      maxConcurrency: 3,
      timeoutMs: 2_500,
    },
  ];
}

function buildActiveStreamBackendDefinitions(connectionCount) {
  const backendCount = Math.max(8, Math.ceil(connectionCount / 60));
  const slots = Math.ceil(connectionCount / backendCount);
  return Array.from({ length: backendCount }, (_, index) => ({
    id: `stream-bulk-openai-${index + 1}`,
    profile: `stream-bulk-openai-${index + 1}`,
    connector: "openai",
    models: ["chaos-shared-model", `chaos-bulk-model-${index + 1}`],
    models: ["chaos-*"],
    maxConcurrency: slots,
    timeoutMs: 90_000,
  }));
}

async function runRequestedStreamingClient(baseUrl, stats, requestIndex, targetTokens) {
  incrementCounter(stats.operations, "stream_fixed");
  const segmentCount = clamp(Math.ceil(targetTokens / 320), 24, 160);
  const chunkDelayMs = clamp(Math.round(15_000 / segmentCount), 90, 180);
  const payload = createRequestedStreamPayload(requestIndex, targetTokens, chunkDelayMs);

  try {
    const { response, requestId, statusCode } = await sendChatRequestOverHttp(baseUrl, payload, stats);
    if (requestId) {
      stats.requestIds.push(requestId);
    }

    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stats.bytesReceived += buffer.length;
      stats.streamChunks += 1;
    }

    incrementCounter(stats.results, statusCode === 200 ? "success" : "error");
  } catch (error) {
    incrementCounter(stats.results, "error");
    incrementCounter(stats.errors, error?.name ?? "unknown");
  }
}

async function runActiveStreamWorker(baseUrl, connections, requestOffset, workerIndex) {
  const workerPath = path.join(__dirname, "active-stream-worker.cjs");

  return await new Promise((resolve, reject) => {
    let resultMessage;
    let settled = false;
    const worker = fork(workerPath, [
      `--base-url=${baseUrl}`,
      `--connections=${connections}`,
      `--min-tokens=${ACTIVE_STREAM_MIN_TOKENS}`,
      `--max-tokens=${ACTIVE_STREAM_MAX_TOKENS}`,
      `--request-offset=${requestOffset}`,
      "--start-spacing-ms=120",
      `--start-offset-ms=${workerIndex * 12}`,
    ], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });

    const finish = (callback) => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
    };

    worker.once("error", (error) => {
      finish(() => reject(error));
    });

    worker.on("message", (message) => {
      if (!message || typeof message !== "object") {
        return;
      }

      if (message.type === "error") {
        finish(() => reject(new Error(message.message ?? "Active-stream worker failed.")));
        return;
      }

      if (message.type === "result") {
        resultMessage = message;
      }
    });

    worker.once("exit", (code, signal) => {
      finish(() => {
        if (code !== 0) {
          reject(new Error(`Active-stream worker exited with code ${code ?? "unknown"}${signal ? ` (signal: ${signal})` : ""}.`));
          return;
        }

        if (!resultMessage) {
          reject(new Error("Active-stream worker exited without sending results."));
          return;
        }

        resolve(resultMessage);
      });
    });
  });
}

async function runChaosProfile(baseUrl, server, loadBalancer, dashboardStalls, clientStats) {
  const deadline = Date.now() + CHAOS_DURATION_MS;
  await Promise.all([
    ...Array.from({ length: 8 }, (_, index) => runWorkerLoop(
      (requestIndex) => runJsonClient(baseUrl, clientStats, (index * 10_000) + requestIndex),
      deadline,
    )),
    ...Array.from({ length: 5 }, (_, index) => runWorkerLoop(
      (requestIndex) => runStreamingClient(baseUrl, clientStats, 100_000 + (index * 10_000) + requestIndex),
      deadline,
    )),
    ...Array.from({ length: 4 }, (_, index) => runWorkerLoop(
      (requestIndex) => runAbortingStreamingClient(baseUrl, clientStats, 200_000 + (index * 10_000) + requestIndex),
      deadline,
    )),
    ...Array.from({ length: 2 }, () => runWorkerLoop(
      () => runDashboardChurnClient(baseUrl, clientStats),
      deadline,
    )),
    ...Array.from({ length: 2 }, () => runWorkerLoop(
      () => runDashboardStallClient(baseUrl, clientStats, dashboardStalls),
      deadline,
    )),
    runWorkerLoop(() => runDashboardPoller(baseUrl, clientStats), deadline),
  ]);

  for (const connection of Array.from(dashboardStalls)) {
    connection.request.destroy();
    connection.response.destroy();
    dashboardStalls.delete(connection);
  }

  await waitForCondition(() => {
    const snapshot = loadBalancer.getSnapshot();
    return snapshot.queueDepth === 0 && server.listActiveConnections().length === 0;
  }, 12_000, "Timed out waiting for llmproxy to drain active chaos traffic.");

  await waitForCondition(
    () => server.getDashboardSseClientCount() === 0,
    4_000,
    `Timed out waiting for dashboard SSE clients to disconnect. Remaining clients: ${server.getDashboardSseClientCount()}.`,
  );

  return {
    extraConfig: {
      mode: "chaos",
      durationMs: CHAOS_DURATION_MS,
    },
    extraLoad: {},
    extraVerdicts: [],
  };
}

async function runActiveStreamsProfile(baseUrl, server, loadBalancer, clientStats) {
  const workerCount = Math.min(10, Math.max(2, Math.ceil(ACTIVE_STREAM_CONNECTIONS / 50)));
  const baseConnectionsPerWorker = Math.floor(ACTIVE_STREAM_CONNECTIONS / workerCount);
  const workerConnections = Array.from({ length: workerCount }, (_, index) => (
    baseConnectionsPerWorker + (index < (ACTIVE_STREAM_CONNECTIONS % workerCount) ? 1 : 0)
  ));
  let nextRequestOffset = 300_000;
  const workerPromises = workerConnections.map((connections, index) => {
    const workerRequestOffset = nextRequestOffset;
    nextRequestOffset += connections;
    return runActiveStreamWorker(baseUrl, connections, workerRequestOffset, index);
  });
  let peakActiveConnections = 0;
  let peakStreamingConnections = 0;
  let clientsSettled = false;
  const settlePromise = Promise.all(workerPromises).finally(() => {
    clientsSettled = true;
  });
  const peakDeadline = Date.now() + 60_000;

  while (Date.now() < peakDeadline) {
    const activeConnections = server.listActiveConnections();
    peakActiveConnections = Math.max(peakActiveConnections, activeConnections.length);

    let currentStreamingConnections = 0;
    for (const connection of activeConnections) {
      if (connection.phase === "streaming") {
        currentStreamingConnections += 1;
      }
    }

    peakStreamingConnections = Math.max(peakStreamingConnections, currentStreamingConnections);
    if (peakStreamingConnections >= ACTIVE_STREAM_CONNECTIONS) {
      break;
    }
    if (clientsSettled) {
      break;
    }

    await delay(50);
  }

  const workerResults = await settlePromise;
  let tokenTargetCount = 0;
  let tokenTargetSum = 0;
  let tokenTargetMin = Number.POSITIVE_INFINITY;
  let tokenTargetMax = 0;
  let successfulResponses = 0;
  const requestMix = {};

  for (const workerResult of workerResults) {
    mergeClientStats(clientStats, workerResult.clientStats);
    mergeCounterMaps(requestMix, workerResult.requestMix);
    successfulResponses += workerResult.clientStats?.results?.success ?? 0;

    const tokenTargets = workerResult.tokenTargets;
    if (tokenTargets && typeof tokenTargets === "object") {
      if (typeof tokenTargets.count === "number") {
        tokenTargetCount += tokenTargets.count;
      }
      if (typeof tokenTargets.sum === "number") {
        tokenTargetSum += tokenTargets.sum;
      }
      if (typeof tokenTargets.min === "number") {
        tokenTargetMin = Math.min(tokenTargetMin, tokenTargets.min);
      }
      if (typeof tokenTargets.max === "number") {
        tokenTargetMax = Math.max(tokenTargetMax, tokenTargets.max);
      }
    }
  }

  await waitForCondition(() => {
    const snapshot = loadBalancer.getSnapshot();
    return snapshot.queueDepth === 0 && server.listActiveConnections().length === 0;
  }, 30_000, "Timed out waiting for the 500-stream run to drain.");
  const minimumPeakActiveConnections = Math.max(
    1,
    ACTIVE_STREAM_CONNECTIONS - Math.max(workerCount * 2, Math.ceil(ACTIVE_STREAM_CONNECTIONS * 0.03)),
  );
  const extraVerdicts = [];
  if (peakActiveConnections < minimumPeakActiveConnections) {
    extraVerdicts.push(
      `active connections peaked at ${peakActiveConnections}; expected at least ${minimumPeakActiveConnections}`,
    );
  }
  if (successfulResponses !== ACTIVE_STREAM_CONNECTIONS) {
    extraVerdicts.push(
      `successful active-stream responses were ${successfulResponses} of ${ACTIVE_STREAM_CONNECTIONS}`,
    );
  }

  return {
    extraConfig: {
      mode: "active-streams",
      requestedConnections: ACTIVE_STREAM_CONNECTIONS,
      workerCount,
      minTokens: ACTIVE_STREAM_MIN_TOKENS,
      maxTokens: ACTIVE_STREAM_MAX_TOKENS,
    },
    extraLoad: {
      peakObservedActiveConnections: peakActiveConnections,
      peakObservedStreamingConnections: peakStreamingConnections,
      requestedConnections: ACTIVE_STREAM_CONNECTIONS,
      requestMix,
      successfulResponses,
      tokenTargets: {
        min: tokenTargetCount > 0 ? tokenTargetMin : 0,
        max: tokenTargetCount > 0 ? tokenTargetMax : 0,
        average: tokenTargetCount > 0 ? Math.round((tokenTargetSum / tokenTargetCount) * 10) / 10 : 0,
      },
    },
    extraVerdicts,
  };
}

async function main() {
  const { NitroTestServer, createLlmproxyTestRuntimeDependencies } = await loadTestRuntime();
  const tempDir = await mkdtemp(path.join(tmpdir(), "llmproxy-chaos-memory-"));
  const cleanup = [];
  const dashboardStalls = new Set();

  try {
    const backendDefinitions = RUN_MODE === "active-streams"
      ? buildActiveStreamBackendDefinitions(ACTIVE_STREAM_CONNECTIONS)
      : buildChaosBackendDefinitions();

    for (const definition of backendDefinitions) {
      definition.port = await getFreePort();
    }

    const chaosBackends = [];
    for (const definition of backendDefinitions) {
      const backend = await startChaosBackend(definition);
      chaosBackends.push(backend);
      cleanup.push(async () => {
        await new Promise((resolve, reject) => {
          backend.server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
      });
    }

    const proxyPort = REQUESTED_PROXY_PORT > 0 ? REQUESTED_PROXY_PORT : await getFreePort();
    const serverConfig = RUN_MODE === "active-streams"
      ? {
        requestTimeoutMs: 90_000,
        queueTimeoutMs: 30_000,
        healthCheckIntervalMs: 2_000,
        recentRequestLimit: 64,
      }
      : {
        requestTimeoutMs: 2_500,
        queueTimeoutMs: 1_000,
        healthCheckIntervalMs: 1_500,
        recentRequestLimit: 24,
      };
    const config = {
      ...serverConfig,
      connections: chaosBackends.map((backend) => backend.config),
    };

    const configPath = path.join(tempDir, "llmproxy-chaos.config.json");
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    const dependencies = await createLlmproxyTestRuntimeDependencies(configPath);
    const { loadBalancer } = dependencies;
    cleanup.push(async () => {
      await loadBalancer.stop();
    });

    const server = new NitroTestServer(dependencies, {
      listenBacklog: 4_096,
      port: proxyPort,
    });
    await server.start();
    cleanup.push(async () => {
      await server.stop();
    });

    const baseUrl = `http://127.0.0.1:${proxyPort}`;
    const dashboardUrl = `${baseUrl}/dashboard`;
    await waitForCondition(() => {
      const snapshot = loadBalancer.getSnapshot();
      return snapshot.backends.some((backend) => backend.healthy && backend.discoveredModels.includes("chaos-shared-model"));
    }, 8_000, "Timed out waiting for chaos backends to become healthy.");

    const clientStats = createClientStats();

    await forceGc();
    const baselineMemory = memorySnapshot();
    const sampler = startMemorySampler(server, loadBalancer, clientStats);
    const execution = RUN_MODE === "active-streams"
      ? await runActiveStreamsProfile(baseUrl, server, loadBalancer, clientStats)
      : await runChaosProfile(baseUrl, server, loadBalancer, dashboardStalls, clientStats);

    sampler.stop();
    await forceGc();
    const finalMemory = memorySnapshot();
    const samples = sampler.samples;
    const retainedDetailBudgetBytes =
      RUN_MODE === "active-streams"
        ? MAX_ACTIVE_STREAM_RECENT_DETAIL_BYTES
        : MAX_CHAOS_RECENT_DETAIL_BYTES;
    const retainedActiveStreamDetail =
      RUN_MODE === "active-streams"
        ? inspectRetainedActiveStreamDetail(loadBalancer)
        : { sample: null, verdicts: [] };
    const retainedDetailBytes = Array.from(loadBalancer.recentRequestDetails.values()).reduce((sum, detail) => (
      sum + Buffer.byteLength(JSON.stringify(detail))
    ), 0);
    const peakHeapMb = samples.reduce((max, sample) => Math.max(max, sample.heapUsedMb), finalMemory.heapUsedMb);
    const peakRssMb = samples.reduce((max, sample) => Math.max(max, sample.rssMb), finalMemory.rssMb);
    const peakSseBufferedBytes = samples.reduce((max, sample) => Math.max(max, sample.sseBufferedBytes), 0);
    const maxQueueDepth = samples.reduce((max, sample) => Math.max(max, sample.queueDepth), 0);
    const maxActiveConnections = samples.reduce((max, sample) => Math.max(max, sample.activeConnections), 0);
    const peakQueuedConnections = samples.reduce((max, sample) => Math.max(max, sample.queuedConnections), 0);
    const peakConnectedConnections = samples.reduce((max, sample) => Math.max(max, sample.connectedConnections), 0);
    const peakStreamingConnections = samples.reduce((max, sample) => Math.max(max, sample.streamingConnections), 0);
    const heapGrowthMb = Math.round((finalMemory.heapUsedMb - baselineMemory.heapUsedMb) * 10) / 10;

    const report = {
      ok: true,
      server: {
        baseUrl,
        dashboardUrl,
      },
      config: {
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        backendCount: chaosBackends.length,
        retainedDetailBudgetBytes,
        ...execution.extraConfig,
      },
      memory: {
        baseline: baselineMemory,
        final: finalMemory,
        peakHeapMb,
        peakRssMb,
        heapGrowthMb,
      },
      load: {
        clientStats,
        maxQueueDepth,
        maxActiveConnections,
        peakQueuedConnections,
        peakConnectedConnections,
        peakStreamingConnections,
        retainedDetailBytes,
        retainedRequestCount: loadBalancer.recentRequestDetails.size,
        recentRequestLimit: config.recentRequestLimit,
        retainedDetailSample: retainedActiveStreamDetail.sample,
        peakSseBufferedBytes,
        finalSseClientCount: server.getDashboardSseClientCount(),
        ...execution.extraLoad,
      },
      backendStats: Object.fromEntries(chaosBackends.map((backend) => [backend.config.id, backend.stats])),
      samples,
    };

    const verdicts = [];
    if (heapGrowthMb > MAX_FINAL_HEAP_GROWTH_MB) {
      verdicts.push(`final heap grew by ${heapGrowthMb} MB`);
    }
    if (retainedDetailBytes > retainedDetailBudgetBytes) {
      verdicts.push(`retained request detail bytes reached ${retainedDetailBytes}`);
    }
    if (peakSseBufferedBytes > MAX_SSE_BUFFER_BYTES) {
      verdicts.push(`SSE buffered bytes peaked at ${peakSseBufferedBytes}`);
    }
    if (server.getDashboardSseClientCount() !== 0) {
      verdicts.push(`SSE clients remained connected: ${server.getDashboardSseClientCount()}`);
    }
    if (loadBalancer.getSnapshot().queueDepth !== 0 || server.listActiveConnections().length !== 0) {
      verdicts.push("proxy did not fully drain active or queued requests");
    }
    for (const verdict of retainedActiveStreamDetail.verdicts) {
      verdicts.push(verdict);
    }
    for (const verdict of execution.extraVerdicts) {
      verdicts.push(verdict);
    }

    if (verdicts.length > 0) {
      report.ok = false;
      report.verdicts = verdicts;
    }

    process.stdout.write(`${JSON.stringify({
      mode: RUN_MODE,
      baseUrl,
      dashboardUrl,
      ok: report.ok,
      heapGrowthMb,
      peakHeapMb,
      peakRssMb,
      retainedDetailBytes,
      maxQueueDepth,
      maxActiveConnections,
      peakQueuedConnections,
      peakConnectedConnections,
      peakStreamingConnections,
      peakSseBufferedBytes,
      finalSseClientCount: server.getDashboardSseClientCount(),
      verdicts: report.verdicts ?? [],
    }, null, 2)}\n`);

    if (!report.ok) {
      process.exitCode = 1;
    }

    if (HOLD_OPEN_AFTER_RUN) {
      process.stdout.write(`${JSON.stringify({
        holdOpen: true,
        dashboardUrl,
      }, null, 2)}\n`);

      await new Promise((resolve) => {
        const finish = () => resolve();
        process.once("SIGINT", finish);
        process.once("SIGTERM", finish);
      });
    }
  } finally {
    for (const connection of Array.from(dashboardStalls)) {
      connection.request.destroy();
      connection.response.destroy();
      dashboardStalls.delete(connection);
    }

    for (const entry of cleanup.reverse()) {
      await entry();
    }

    ACTIVE_STREAM_CLIENT_AGENT.destroy();
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
