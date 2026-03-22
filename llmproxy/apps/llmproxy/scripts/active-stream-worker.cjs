const { randomInt } = require("node:crypto");
const { Agent: HttpAgent, request: httpRequest } = require("node:http");

function readCliOption(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function parsePositiveInteger(value, fallback) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function incrementCounter(container, key, delta = 1) {
  container[key] = (container[key] ?? 0) + delta;
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
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

function buildRequestedStreamPlan(targetTokens) {
  const segmentCount = clamp(Math.ceil(targetTokens / 320), 24, 160);
  const contentSize = clamp(Math.round(targetTokens / 36), 240, 1_200);
  const chunkDelayMs = clamp(Math.round(26_000 / segmentCount), 240, 360);

  return {
    segmentCount,
    contentSize,
    chunkDelayMs,
  };
}

function createRequestedPayload(requestIndex, targetTokens, chunkDelayMs, stream) {
  return {
    model: requestIndex % 5 === 0 ? "auto" : "chaos-shared-model",
    stream,
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

async function sendChatRequestOverHttp(baseUrl, payload, stats, agent) {
  const url = new URL("/v1/chat/completions", baseUrl);
  const body = JSON.stringify(payload);

  return await new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method: "POST",
      agent,
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

async function runRequestedStreamingClient(baseUrl, stats, requestIndex, targetTokens, expectedContentLength, agent) {
  incrementCounter(stats.operations, "stream_fixed");
  const { chunkDelayMs } = buildRequestedStreamPlan(targetTokens);
  const payload = createRequestedPayload(requestIndex, targetTokens, chunkDelayMs, true);

  try {
    const { response, requestId, statusCode } = await sendChatRequestOverHttp(baseUrl, payload, stats, agent);
    if (requestId) {
      stats.requestIds.push(requestId);
    }

    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stats.bytesReceived += buffer.length;
      stats.streamChunks += 1;
    }

    if (statusCode === 200 && expectedContentLength <= 0) {
      throw new Error("Missing expected content length for streaming verification.");
    }

    incrementCounter(stats.results, statusCode === 200 ? "success" : "error");
  } catch (error) {
    incrementCounter(stats.results, "error");
    incrementCounter(stats.errors, error?.code ?? error?.name ?? "unknown");
  }
}

async function runRequestedJsonClient(baseUrl, stats, requestIndex, targetTokens, expectedContentLength, agent) {
  incrementCounter(stats.operations, "json_fixed");
  const { chunkDelayMs } = buildRequestedStreamPlan(targetTokens);
  const payload = createRequestedPayload(requestIndex, targetTokens, chunkDelayMs, false);

  try {
    const { response, requestId, statusCode } = await sendChatRequestOverHttp(baseUrl, payload, stats, agent);
    if (requestId) {
      stats.requestIds.push(requestId);
    }

    const chunks = [];
    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      stats.bytesReceived += buffer.length;
    }

    const body = Buffer.concat(chunks).toString("utf8");
    if (statusCode !== 200) {
      incrementCounter(stats.results, "error");
      return;
    }

    if (body.includes("truncated to protect memory") || body.includes("truncated to reduce memory usage")) {
      throw new Error("Proxy truncated a synthesized JSON response.");
    }

    const parsed = JSON.parse(body);
    const content = parsed?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Synthesized JSON response had no assistant content.");
    }

    if (content.length !== expectedContentLength) {
      throw new Error(`Synthesized JSON content length ${content.length} did not match expected ${expectedContentLength}.`);
    }

    incrementCounter(stats.results, "success");
  } catch (error) {
    incrementCounter(stats.results, "error");
    incrementCounter(stats.errors, error?.code ?? error?.name ?? "unknown");
  }
}

async function main() {
  const baseUrl = readCliOption("base-url");
  if (!baseUrl) {
    throw new Error("Missing --base-url for active-stream worker.");
  }

  const connections = parsePositiveInteger(readCliOption("connections"), 50);
  const minTokens = parsePositiveInteger(readCliOption("min-tokens"), 1_000);
  const maxTokens = parsePositiveInteger(readCliOption("max-tokens"), 40_000);
  const requestOffset = parsePositiveInteger(readCliOption("request-offset"), 0);
  const startSpacingMs = parsePositiveInteger(readCliOption("start-spacing-ms"), 120);
  const startOffsetMs = parsePositiveInteger(readCliOption("start-offset-ms"), 0);
  const agent = new HttpAgent({
    keepAlive: false,
    maxSockets: Math.max(128, connections * 2),
  });
  const stats = createClientStats();
  const requests = Array.from({ length: connections }, (_, index) => {
    const targetTokens = randomInt(minTokens, maxTokens + 1);
    const plan = buildRequestedStreamPlan(targetTokens);
    const requestIndex = requestOffset + index;

    return {
      targetTokens,
      expectedContentLength: plan.segmentCount * plan.contentSize,
      requestIndex,
      requestType: requestIndex % 2 === 0 ? "stream" : "json",
    };
  });

  try {
    await Promise.all(requests.map((request, index) => (
      delay(startOffsetMs + (index * startSpacingMs))
        .then(() => (
          request.requestType === "stream"
            ? runRequestedStreamingClient(
              baseUrl,
              stats,
              request.requestIndex,
              request.targetTokens,
              request.expectedContentLength,
              agent,
            )
            : runRequestedJsonClient(
              baseUrl,
              stats,
              request.requestIndex,
              request.targetTokens,
              request.expectedContentLength,
              agent,
            )
        ))
    )));
  } finally {
    agent.destroy();
  }

  process.send?.({
    type: "result",
    clientStats: stats,
    tokenTargets: {
      count: requests.length,
      min: requests.length > 0 ? Math.min(...requests.map((entry) => entry.targetTokens)) : 0,
      max: requests.length > 0 ? Math.max(...requests.map((entry) => entry.targetTokens)) : 0,
      sum: requests.reduce((sum, entry) => sum + entry.targetTokens, 0),
    },
    requestMix: requests.reduce((mix, entry) => {
      mix[entry.requestType] = (mix[entry.requestType] ?? 0) + 1;
      return mix;
    }, {}),
  });
}

main().catch((error) => {
  process.send?.({
    type: "error",
    message: error?.stack ?? String(error),
  });
  process.exitCode = 1;
});
