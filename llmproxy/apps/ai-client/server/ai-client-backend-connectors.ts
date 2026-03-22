import type { ConnectionConfig, BackendConnector, JsonValue } from "../../shared/type-api";
import { buildStreamingRequestBody } from "../../shared/server/streaming-request";

type JsonObject = Record<string, unknown>;

export interface BackendRequestPlan {
  pathAndSearch: string;
  body?: Buffer;
  responseMode: "raw" | "openai-sse" | "ollama-ndjson";
}

export interface SplitJsonLinesResult {
  lines: string[];
  remainder: string;
}

export function getBackendConnector(backend: { connector?: BackendConnector }): BackendConnector {
  if (backend.connector === "ollama") {
    return "ollama";
  }

  if (backend.connector === "llama.cpp") {
    return "llama.cpp";
  }

  return "openai";
}

export function getDefaultHealthPaths(
  backend: { connector?: BackendConnector; healthPath?: string },
): string[] {
  if (backend.healthPath) {
    return [backend.healthPath];
  }

  if (getBackendConnector(backend) === "ollama") {
    return ["/api/tags", "/v1/models"];
  }

  return ["/v1/models", "/health"];
}

export function buildBackendRequestPlan(
  backend: ConnectionConfig,
  method: string,
  pathname: string,
  search: string,
  rawBody: Buffer,
  parsedBody: Record<string, unknown> | undefined,
  forceStreaming: boolean,
): BackendRequestPlan {
  const pathAndSearch = `${pathname}${search}`;
  const normalizedParsedBody =
    getBackendConnector(backend) === "openai" && method === "POST" && pathname === "/v1/chat/completions"
      ? sanitizeOpenAiChatRequestBody(parsedBody)
      : parsedBody;

  if (getBackendConnector(backend) === "ollama" && method === "POST" && pathname === "/v1/chat/completions") {
    return {
      pathAndSearch: `/api/chat${search}`,
      body: buildOllamaChatRequestBody(parsedBody, forceStreaming),
      responseMode: "ollama-ndjson",
    };
  }

  if (forceStreaming && normalizedParsedBody) {
    return {
      pathAndSearch,
      body: buildStreamingRequestBody(normalizedParsedBody),
      responseMode: "openai-sse",
    };
  }

  return {
    pathAndSearch,
    body: normalizedParsedBody ? Buffer.from(JSON.stringify(normalizedParsedBody)) : (rawBody.length > 0 ? rawBody : undefined),
    responseMode: "raw",
  };
}

export function buildOllamaChatRequestBody(
  parsedBody: Record<string, unknown> | undefined,
  forceStreaming: boolean,
): Buffer {
  if (!parsedBody) {
    throw new Error("The Ollama connector requires a JSON chat completions request body.");
  }

  const payload: Record<string, JsonValue> = {};

  if (typeof parsedBody.model === "string" && parsedBody.model.length > 0) {
    payload.model = parsedBody.model;
  }

  const messages = normalizeMessagesForOllama(parsedBody.messages);
  if (messages) {
    payload.messages = messages;
  }

  const tools = normalizeJsonValue(parsedBody.tools);
  if (tools !== undefined) {
    payload.tools = tools;
  }

  const format = normalizeJsonValue(parsedBody.response_format ?? parsedBody.format);
  if (format !== undefined) {
    payload.format = format;
  }

  const keepAlive = normalizeJsonValue(parsedBody.keep_alive);
  if (keepAlive !== undefined) {
    payload.keep_alive = keepAlive;
  }

  payload.stream = forceStreaming || parsedBody.stream === true;

  const options = buildOllamaOptions(parsedBody);
  if (Object.keys(options).length > 0) {
    payload.options = options;
  }

  return Buffer.from(JSON.stringify(payload));
}

export function splitJsonLines(buffer: string, flush: boolean): SplitJsonLinesResult {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");
  const remainder = flush ? "" : (parts.pop() ?? "");
  const lines = flush ? parts.concat(remainder).filter((line) => line.trim().length > 0) : parts.filter((line) => line.trim().length > 0);

  return {
    lines,
    remainder: flush ? "" : remainder,
  };
}

export function isOllamaNdjson(headers: Headers): boolean {
  const contentType = headers.get("content-type");
  return typeof contentType === "string" && contentType.toLowerCase().includes("application/x-ndjson");
}

export function convertOllamaChunkToOpenAiChunk(payload: unknown, requestId: string): JsonObject | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const message = isRecord(payload.message) ? payload.message : {};
  const delta: JsonObject = {};
  const role = typeof message.role === "string" && message.role.length > 0 ? message.role : "assistant";
  delta.role = role;

  if (typeof message.content === "string") {
    delta.content = message.content;
  }

  const reasoning =
    typeof message.thinking === "string"
      ? message.thinking
      : (typeof message.reasoning === "string" ? message.reasoning : undefined);
  if (typeof reasoning === "string") {
    delta.reasoning_content = reasoning;
  }

  const toolCalls = normalizeOllamaToolCalls(message.tool_calls);
  if (toolCalls) {
    delta.tool_calls = toolCalls;
  }

  const usage = buildOllamaUsagePayload(payload);
  const timings = buildOllamaTimingsPayload(payload);
  const finishReason =
    payload.done === true
      ? (typeof payload.done_reason === "string" && payload.done_reason.length > 0 ? payload.done_reason : "stop")
      : null;

  const chunk: JsonObject = {
    id: `chatcmpl-ollama-${requestId}`,
    object: "chat.completion.chunk",
    created: parseCreatedAt(payload.created_at),
    model: typeof payload.model === "string" ? payload.model : "",
    system_fingerprint: "fp_ollama",
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };

  if (usage) {
    chunk.usage = usage;
  }

  if (timings) {
    chunk.timings = timings;
  }

  return chunk;
}

function parseCreatedAt(value: unknown): number {
  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) {
      return Math.floor(timestamp / 1000);
    }
  }

  return Math.floor(Date.now() / 1000);
}

function buildOllamaUsagePayload(payload: JsonObject): JsonObject | undefined {
  const promptTokens = readNumber(payload.prompt_eval_count);
  const completionTokens = readNumber(payload.eval_count);
  if (promptTokens === undefined && completionTokens === undefined) {
    return undefined;
  }

  return {
    ...(promptTokens !== undefined ? { prompt_tokens: promptTokens } : {}),
    ...(completionTokens !== undefined ? { completion_tokens: completionTokens } : {}),
    ...(
      promptTokens !== undefined && completionTokens !== undefined
        ? { total_tokens: promptTokens + completionTokens }
        : {}
    ),
  };
}

function buildOllamaTimingsPayload(payload: JsonObject): JsonObject | undefined {
  const promptTokens = readNumber(payload.prompt_eval_count);
  const completionTokens = readNumber(payload.eval_count);
  const promptDurationNs = readNumber(payload.prompt_eval_duration);
  const completionDurationNs = readNumber(payload.eval_duration);
  const promptMs = nanosecondsToMilliseconds(promptDurationNs);
  const completionMs = nanosecondsToMilliseconds(completionDurationNs);
  const promptPerSecond = ratePerSecond(promptTokens, promptDurationNs);
  const completionPerSecond = ratePerSecond(completionTokens, completionDurationNs);

  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    promptMs === undefined &&
    completionMs === undefined &&
    promptPerSecond === undefined &&
    completionPerSecond === undefined
  ) {
    return undefined;
  }

  return {
    ...(promptTokens !== undefined ? { prompt_n: promptTokens } : {}),
    ...(completionTokens !== undefined ? { predicted_n: completionTokens } : {}),
    ...(promptMs !== undefined ? { prompt_ms: promptMs } : {}),
    ...(completionMs !== undefined ? { predicted_ms: completionMs } : {}),
    ...(promptPerSecond !== undefined ? { prompt_per_second: promptPerSecond } : {}),
    ...(completionPerSecond !== undefined ? { predicted_per_second: completionPerSecond } : {}),
  };
}

function nanosecondsToMilliseconds(value: number | undefined): number | undefined {
  return typeof value === "number" ? value / 1_000_000 : undefined;
}

function ratePerSecond(count: number | undefined, durationNs: number | undefined): number | undefined {
  if (count === undefined || durationNs === undefined || durationNs <= 0) {
    return undefined;
  }

  return count / (durationNs / 1_000_000_000);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildOllamaOptions(parsedBody: Record<string, unknown>): Record<string, JsonValue> {
  const options: Record<string, JsonValue> = {};
  mapNumberOption(parsedBody.temperature, "temperature", options);
  mapNumberOption(parsedBody.top_p, "top_p", options);
  mapNumberOption(parsedBody.top_k, "top_k", options);
  mapNumberOption(parsedBody.min_p, "min_p", options);
  mapNumberOption(parsedBody.repeat_penalty, "repeat_penalty", options);
  mapNumberOption(parsedBody.seed, "seed", options);
  mapNumberOption(parsedBody.max_tokens ?? parsedBody.max_completion_tokens, "num_predict", options);

  if (typeof parsedBody.stop === "string") {
    options.stop = [parsedBody.stop];
  } else if (Array.isArray(parsedBody.stop)) {
    const stops = parsedBody.stop.filter((value): value is string => typeof value === "string" && value.length > 0);
    if (stops.length > 0) {
      options.stop = stops;
    }
  }

  return options;
}

function mapNumberOption(value: unknown, targetKey: string, options: Record<string, JsonValue>): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    options[targetKey] = value;
  }
}

function normalizeMessagesForOllama(value: unknown): JsonValue[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const messages: JsonValue[] = [];

  for (const entry of value) {
    const normalized = normalizeMessageForOllama(entry);
    if (normalized !== undefined) {
      messages.push(normalized);
    }
  }

  return messages;
}

function normalizeMessageForOllama(value: unknown): JsonValue | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const message: Record<string, JsonValue> = {};

  if (typeof value.role === "string" && value.role.length > 0) {
    message.role = value.role;
  }

  const content = normalizeMessageContent(value.content);
  if (content !== undefined) {
    message.content = content;
  }

  const name = normalizeJsonValue(value.name);
  if (name !== undefined) {
    message.name = name;
  }

  const toolCallId = normalizeJsonValue(value.tool_call_id);
  if (toolCallId !== undefined) {
    message.tool_call_id = toolCallId;
  }

  const toolCalls = normalizeToolCallsForOllama(value.tool_calls);
  if (toolCalls !== undefined) {
    message.tool_calls = toolCalls;
  }

  if (Object.keys(message).length === 0) {
    return undefined;
  }

  return message;
}

function normalizeToolCallsForOllama(value: unknown): JsonValue[] | undefined {
  if (!Array.isArray(value)) {
    const normalized = normalizeJsonValue(value);
    return Array.isArray(normalized) ? normalized : undefined;
  }

  const toolCalls: JsonValue[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const toolCall: Record<string, JsonValue> = {};
    const id = normalizeJsonValue(entry.id);
    if (id !== undefined) {
      toolCall.id = id;
    }

    const type = normalizeJsonValue(entry.type);
    if (type !== undefined) {
      toolCall.type = type;
    }

    const fn = isRecord(entry.function) ? entry.function : null;
    if (fn) {
      const functionPayload: Record<string, JsonValue> = {};

      if (typeof fn.index === "number" && Number.isFinite(fn.index)) {
        functionPayload.index = fn.index;
      }

      const name = normalizeJsonValue(fn.name);
      if (name !== undefined) {
        functionPayload.name = name;
      }

      const argumentsValue = normalizeOllamaToolArguments(fn.arguments);
      if (argumentsValue !== undefined) {
        functionPayload.arguments = argumentsValue;
      }

      toolCall.function = functionPayload;
    }

    if (Object.keys(toolCall).length > 0) {
      toolCalls.push(toolCall);
    }
  }

  return toolCalls.length > 0 ? toolCalls : undefined;
}

function normalizeOllamaToolArguments(value: unknown): JsonValue | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return "";
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const normalized = normalizeJsonValue(parsed);
      return normalized ?? trimmed;
    } catch {
      return {
        __proxy_raw_arguments: trimmed,
        __proxy_note: "Original tool arguments were not valid JSON.",
      };
    }
  }

  return normalizeJsonValue(value);
}

function normalizeMessageContent(value: unknown): JsonValue | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return normalizeJsonValue(value);
  }

  const textParts: string[] = [];
  const images: string[] = [];

  for (const part of value) {
    if (!isRecord(part)) {
      continue;
    }

    if (typeof part.text === "string" && part.text.length > 0) {
      textParts.push(part.text);
      continue;
    }

    if (isRecord(part.image_url) && typeof part.image_url.url === "string" && part.image_url.url.length > 0) {
      images.push(part.image_url.url);
      continue;
    }

    if (typeof part.image === "string" && part.image.length > 0) {
      images.push(part.image);
    }
  }

  if (images.length > 0) {
    const payload: Record<string, JsonValue> = {};
    if (textParts.length > 0) {
      payload.text = textParts.join("\n\n");
    }
    payload.images = images;
    return payload;
  }

  if (textParts.length > 0) {
    return textParts.join("\n\n");
  }

  return normalizeJsonValue(value);
}

function normalizeOllamaToolCalls(value: unknown): JsonValue[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const toolCalls: JsonValue[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isRecord(entry)) {
      continue;
    }

    const toolCall: Record<string, JsonValue> = {
      index,
      type: "function",
    };

    if (typeof entry.id === "string" && entry.id.length > 0) {
      toolCall.id = entry.id;
    }

    const fn = isRecord(entry.function) ? entry.function : entry;
    const functionPayload: Record<string, JsonValue> = {};
    if (typeof fn.name === "string" && fn.name.length > 0) {
      functionPayload.name = fn.name;
    }

    if (typeof fn.arguments === "string") {
      functionPayload.arguments = fn.arguments;
    } else if (fn.arguments !== undefined) {
      functionPayload.arguments = JSON.stringify(fn.arguments);
    }

    toolCall.function = functionPayload;
    toolCalls.push(toolCall);
  }

  return toolCalls.length > 0 ? toolCalls : undefined;
}

function normalizeJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeJsonValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, entry]) => {
        const normalized = normalizeJsonValue(entry);
        return normalized === undefined ? undefined : [key, normalized] as const;
      })
      .filter((entry): entry is readonly [string, JsonValue] => entry !== undefined);

    return Object.fromEntries(entries);
  }

  return undefined;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeOpenAiChatRequestBody(
  parsedBody: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!parsedBody) {
    return parsedBody;
  }

  const sanitized = { ...parsedBody };
  delete sanitized.top_k;
  delete sanitized.min_p;
  delete sanitized.repeat_penalty;
  return sanitized;
}
