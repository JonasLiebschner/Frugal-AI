import type { ActiveConnectionKind } from "../../../shared/type-api";
import { buildStreamingRequestBody } from "../../../shared/server/streaming-request";

type JsonObject = Record<string, unknown>;
const STREAM_TRUNCATION_MARKER = "[proxy truncated to protect memory]";
const MAX_CHAT_CONTENT_CHARS = 120_000;
const MAX_REASONING_CONTENT_CHARS = 120_000;
const MAX_COMPLETION_TEXT_CHARS = 120_000;
const MAX_TOOL_ARGUMENT_CHARS = 32_000;

interface ChatChoiceState {
  index: number;
  role: string;
  content: string;
  reasoningContent: string;
  functionCall?: FunctionCallState;
  toolCalls: Map<number, ToolCallState>;
  finishReason?: string;
}

interface CompletionChoiceState {
  index: number;
  text: string;
  finishReason?: string;
}

interface FunctionCallState {
  name?: string;
  arguments: string;
}

interface ToolCallState {
  index: number;
  id?: string;
  type?: string;
  function?: FunctionCallState;
}

interface StreamingDeltaCounts {
  addedCompletionTokens: number;
  addedContentTokens: number;
  addedReasoningTokens: number;
  addedTextTokens: number;
}

function appendFragment(current: string, fragment: string, maxLength = MAX_CHAT_CONTENT_CHARS): string {
  if (!fragment) {
    return current;
  }

  if (current.includes(STREAM_TRUNCATION_MARKER)) {
    return current;
  }

  const next = `${current}${fragment}`;
  if (next.length <= maxLength) {
    return next;
  }

  const prefixLength = Math.max(0, maxLength - STREAM_TRUNCATION_MARKER.length - 1);
  return `${next.slice(0, prefixLength)} ${STREAM_TRUNCATION_MARKER}`;
}

export interface StreamingMetricsSnapshot {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  contentTokens: number;
  reasoningTokens: number;
  textTokens: number;
  promptMs?: number;
  generationMs?: number;
  promptTokensPerSecond?: number;
  completionTokensPerSecond?: number;
  finishReason?: string;
  exact: boolean;
}

export interface StreamingAccumulatorUpdate {
  addedCompletionTokens: number;
  addedContentTokens: number;
  addedReasoningTokens: number;
  addedTextTokens: number;
  finishReason?: string;
  metrics: StreamingMetricsSnapshot;
}

export interface ParsedSseBlockResult {
  blocks: string[];
  remainder: string;
}

export class StreamingAccumulator {
  private id?: string;
  private created?: number;
  private model?: string;
  private systemFingerprint?: string;
  private usagePayload?: JsonObject;
  private timingsPayload?: JsonObject;
  private promptTokens?: number;
  private exactCompletionTokens?: number;
  private totalTokens?: number;
  private contentTokens = 0;
  private reasoningTokens = 0;
  private textTokens = 0;
  private promptMs?: number;
  private generationMs?: number;
  private promptTokensPerSecond?: number;
  private completionTokensPerSecond?: number;
  private finishReason?: string;
  private sawPayload = false;
  private readonly chatChoices = new Map<number, ChatChoiceState>();
  private readonly completionChoices = new Map<number, CompletionChoiceState>();
  private readonly preserveFullPayload: boolean;

  public constructor(
    private readonly kind: Exclude<ActiveConnectionKind, "other">,
    options: { preserveFullPayload?: boolean } = {},
  ) {
    this.preserveFullPayload = options.preserveFullPayload === true;
  }

  public get hasPayload(): boolean {
    return this.sawPayload;
  }

  public applyPayload(payload: unknown): StreamingAccumulatorUpdate {
    const counts: StreamingDeltaCounts = {
      addedCompletionTokens: 0,
      addedContentTokens: 0,
      addedReasoningTokens: 0,
      addedTextTokens: 0,
    };

    if (!isRecord(payload)) {
      return {
        ...counts,
        finishReason: this.finishReason,
        metrics: this.getMetrics(),
      };
    }

    this.sawPayload = true;
    if (typeof payload.id === "string") {
      this.id = payload.id;
    }

    if (typeof payload.model === "string") {
      this.model = payload.model;
    }

    if (typeof payload.created === "number") {
      this.created = payload.created;
    }

    if (typeof payload.system_fingerprint === "string") {
      this.systemFingerprint = payload.system_fingerprint;
    }

    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    for (let index = 0; index < choices.length; index += 1) {
      const choice = choices[index];
      if (!isRecord(choice)) {
        continue;
      }

      const choiceIndex = typeof choice.index === "number" ? choice.index : index;
      const finishReason = typeof choice.finish_reason === "string" ? choice.finish_reason : undefined;
      if (finishReason) {
        this.finishReason = finishReason;
      }

      if (this.kind === "chat.completions") {
        this.applyChatChoice(choice, choiceIndex, counts, finishReason);
      } else {
        this.applyCompletionChoice(choice, choiceIndex, counts, finishReason);
      }
    }

    this.applyUsage(payload.usage);
    this.applyTimings(payload.timings);

    return {
      ...counts,
      finishReason: this.finishReason,
      metrics: this.getMetrics(),
    };
  }

  public getMetrics(): StreamingMetricsSnapshot {
    const completionTokens = this.exactCompletionTokens ?? (this.contentTokens + this.reasoningTokens + this.textTokens);
    const totalTokens =
      this.totalTokens ??
      (this.promptTokens !== undefined ? this.promptTokens + completionTokens : undefined);

    return {
      promptTokens: this.promptTokens,
      completionTokens,
      totalTokens,
      contentTokens: this.contentTokens,
      reasoningTokens: this.reasoningTokens,
      textTokens: this.textTokens,
      promptMs: this.promptMs,
      generationMs: this.generationMs,
      promptTokensPerSecond: this.promptTokensPerSecond,
      completionTokensPerSecond: this.completionTokensPerSecond,
      finishReason: this.finishReason,
      exact:
        this.exactCompletionTokens !== undefined ||
        (this.promptTokens !== undefined && totalTokens !== undefined),
    };
  }

  public buildResponse(): JsonObject {
    const response: JsonObject = {
      id: this.id ?? "",
      object: this.kind === "chat.completions" ? "chat.completion" : "text_completion",
      created: this.created ?? 0,
      model: this.model ?? "",
      choices: this.kind === "chat.completions" ? this.buildChatChoices() : this.buildCompletionChoices(),
    };

    if (this.systemFingerprint) {
      response.system_fingerprint = this.systemFingerprint;
    }

    const usage = this.buildUsagePayload();
    if (usage) {
      response.usage = usage;
    }

    const timings = this.buildTimingsPayload();
    if (timings) {
      response.timings = timings;
    }

    return response;
  }

  private applyChatChoice(
    choice: JsonObject,
    choiceIndex: number,
    counts: StreamingDeltaCounts,
    finishReason?: string,
  ): void {
    const state = this.ensureChatChoice(choiceIndex);
    const source = isRecord(choice.delta) ? choice.delta : (isRecord(choice.message) ? choice.message : undefined);

    if (source) {
      if (typeof source.role === "string") {
        state.role = source.role;
      }

      if (typeof source.content === "string") {
        state.content = appendFragment(
          state.content,
          source.content,
          this.preserveFullPayload ? Number.MAX_SAFE_INTEGER : MAX_CHAT_CONTENT_CHARS,
        );
        if (source.content.length > 0) {
          counts.addedCompletionTokens += 1;
          counts.addedContentTokens += 1;
          this.contentTokens += 1;
        }
      }

      const reasoningDelta =
        typeof source.reasoning_content === "string"
          ? source.reasoning_content
          : (typeof source.reasoning === "string" ? source.reasoning : undefined);
      if (typeof reasoningDelta === "string") {
        state.reasoningContent = appendFragment(
          state.reasoningContent,
          reasoningDelta,
          this.preserveFullPayload ? Number.MAX_SAFE_INTEGER : MAX_REASONING_CONTENT_CHARS,
        );
        if (reasoningDelta.length > 0) {
          counts.addedCompletionTokens += 1;
          counts.addedReasoningTokens += 1;
          this.reasoningTokens += 1;
        }
      }

      this.applyFunctionCallPayload(source.function_call, state);
      this.applyToolCalls(source.tool_calls, state);
    }

    if (finishReason) {
      state.finishReason = finishReason;
    }
  }

  private applyCompletionChoice(
    choice: JsonObject,
    choiceIndex: number,
    counts: StreamingDeltaCounts,
    finishReason?: string,
  ): void {
    const state = this.ensureCompletionChoice(choiceIndex);
    const deltaText =
      typeof choice.text === "string"
        ? choice.text
        : (isRecord(choice.delta) && typeof choice.delta.text === "string" ? choice.delta.text : undefined);

    if (typeof deltaText === "string") {
      state.text = appendFragment(
        state.text,
        deltaText,
        this.preserveFullPayload ? Number.MAX_SAFE_INTEGER : MAX_COMPLETION_TEXT_CHARS,
      );
      if (deltaText.length > 0) {
        counts.addedCompletionTokens += 1;
        counts.addedTextTokens += 1;
        this.textTokens += 1;
      }
    }

    if (finishReason) {
      state.finishReason = finishReason;
    }
  }

  private applyUsage(usage: unknown): void {
    if (!isRecord(usage)) {
      return;
    }

    this.usagePayload = { ...(this.usagePayload ?? {}), ...usage };

    if (typeof usage.prompt_tokens === "number") {
      this.promptTokens = usage.prompt_tokens;
    }

    if (typeof usage.completion_tokens === "number") {
      this.exactCompletionTokens = usage.completion_tokens;
    }

    if (typeof usage.total_tokens === "number") {
      this.totalTokens = usage.total_tokens;
    }
  }

  private applyTimings(timings: unknown): void {
    if (!isRecord(timings)) {
      return;
    }

    this.timingsPayload = { ...(this.timingsPayload ?? {}), ...timings };

    if (typeof timings.prompt_n === "number") {
      this.promptTokens = timings.prompt_n;
    }

    if (typeof timings.predicted_n === "number") {
      this.exactCompletionTokens = timings.predicted_n;
    }

    if (typeof timings.prompt_ms === "number") {
      this.promptMs = timings.prompt_ms;
    }

    if (typeof timings.predicted_ms === "number") {
      this.generationMs = timings.predicted_ms;
    }

    if (typeof timings.prompt_per_second === "number") {
      this.promptTokensPerSecond = timings.prompt_per_second;
    }

    if (typeof timings.predicted_per_second === "number") {
      this.completionTokensPerSecond = timings.predicted_per_second;
    }
  }

  private buildUsagePayload(): JsonObject | undefined {
    const completionTokens = this.exactCompletionTokens ?? (this.contentTokens + this.reasoningTokens + this.textTokens);
    const totalTokens =
      this.totalTokens ??
      (this.promptTokens !== undefined ? this.promptTokens + completionTokens : undefined);

    if (!this.usagePayload && this.promptTokens === undefined && totalTokens === undefined) {
      return undefined;
    }

    return {
      ...(this.usagePayload ?? {}),
      ...(this.promptTokens !== undefined ? { prompt_tokens: this.promptTokens } : {}),
      completion_tokens: completionTokens,
      ...(totalTokens !== undefined ? { total_tokens: totalTokens } : {}),
    };
  }

  private buildTimingsPayload(): JsonObject | undefined {
    if (!this.timingsPayload && this.promptMs === undefined && this.generationMs === undefined) {
      return undefined;
    }

    return {
      ...(this.timingsPayload ?? {}),
      ...(this.promptTokens !== undefined ? { prompt_n: this.promptTokens } : {}),
      ...(this.exactCompletionTokens !== undefined ? { predicted_n: this.exactCompletionTokens } : {}),
      ...(this.promptMs !== undefined ? { prompt_ms: this.promptMs } : {}),
      ...(this.generationMs !== undefined ? { predicted_ms: this.generationMs } : {}),
      ...(this.promptTokensPerSecond !== undefined ? { prompt_per_second: this.promptTokensPerSecond } : {}),
      ...(this.completionTokensPerSecond !== undefined ? { predicted_per_second: this.completionTokensPerSecond } : {}),
    };
  }

  private buildChatChoices(): JsonObject[] {
    return Array.from(this.chatChoices.values())
      .sort((left, right) => left.index - right.index)
      .map((choice) => {
        const toolCalls = this.buildToolCallsPayload(choice);
        const message: JsonObject = {
          role: choice.role || "assistant",
          content:
            choice.content.length > 0
              ? choice.content
              : (toolCalls || choice.functionCall ? null : choice.content),
          ...(choice.reasoningContent ? { reasoning_content: choice.reasoningContent } : {}),
          ...(choice.functionCall ? { function_call: this.buildFunctionCallPayload(choice.functionCall) } : {}),
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
        };

        return {
          index: choice.index,
          finish_reason: choice.finishReason ?? null,
          message,
        };
      });
  }

  private buildCompletionChoices(): JsonObject[] {
    return Array.from(this.completionChoices.values())
      .sort((left, right) => left.index - right.index)
      .map((choice) => ({
        index: choice.index,
        finish_reason: choice.finishReason ?? null,
        text: choice.text,
      }));
  }

  private ensureChatChoice(index: number): ChatChoiceState {
    const existing = this.chatChoices.get(index);
    if (existing) {
      return existing;
    }

    const state: ChatChoiceState = {
      index,
      role: "assistant",
      content: "",
      reasoningContent: "",
      toolCalls: new Map<number, ToolCallState>(),
    };
    this.chatChoices.set(index, state);
    return state;
  }

  private ensureCompletionChoice(index: number): CompletionChoiceState {
    const existing = this.completionChoices.get(index);
    if (existing) {
      return existing;
    }

    const state: CompletionChoiceState = {
      index,
      text: "",
    };
    this.completionChoices.set(index, state);
    return state;
  }

  private applyFunctionCallPayload(value: unknown, state: ChatChoiceState): void {
    if (!isRecord(value)) {
      return;
    }

    const functionCall = state.functionCall ?? {
      arguments: "",
    };

    if (typeof value.name === "string" && value.name.length > 0) {
      functionCall.name = value.name;
    }

    if (typeof value.arguments === "string") {
      functionCall.arguments = appendFragment(
        functionCall.arguments,
        value.arguments,
        this.preserveFullPayload ? Number.MAX_SAFE_INTEGER : MAX_TOOL_ARGUMENT_CHARS,
      );
    }

    state.functionCall = functionCall;
  }

  private applyToolCalls(value: unknown, state: ChatChoiceState): void {
    if (!Array.isArray(value)) {
      return;
    }

    for (let index = 0; index < value.length; index += 1) {
      const rawToolCall = value[index];
      if (!isRecord(rawToolCall)) {
        continue;
      }

      const toolCallIndex = typeof rawToolCall.index === "number" ? rawToolCall.index : index;
      const toolCall = state.toolCalls.get(toolCallIndex) ?? {
        index: toolCallIndex,
      };

      if (typeof rawToolCall.id === "string" && rawToolCall.id.length > 0) {
        toolCall.id = rawToolCall.id;
      }

      if (typeof rawToolCall.type === "string" && rawToolCall.type.length > 0) {
        toolCall.type = rawToolCall.type;
      }

      if (isRecord(rawToolCall.function)) {
        const nextFunction = toolCall.function ?? {
          arguments: "",
        };

        if (typeof rawToolCall.function.name === "string" && rawToolCall.function.name.length > 0) {
          nextFunction.name = rawToolCall.function.name;
        }

        if (typeof rawToolCall.function.arguments === "string") {
          nextFunction.arguments = appendFragment(
            nextFunction.arguments,
            rawToolCall.function.arguments,
            this.preserveFullPayload ? Number.MAX_SAFE_INTEGER : MAX_TOOL_ARGUMENT_CHARS,
          );
        }

        toolCall.function = nextFunction;
      }

      state.toolCalls.set(toolCallIndex, toolCall);
    }
  }

  private buildFunctionCallPayload(functionCall: FunctionCallState): JsonObject {
    return {
      ...(functionCall.name ? { name: functionCall.name } : {}),
      arguments: functionCall.arguments,
    };
  }

  private buildToolCallsPayload(choice: ChatChoiceState): JsonObject[] | undefined {
    if (choice.toolCalls.size === 0) {
      return undefined;
    }

    return Array.from(choice.toolCalls.values())
      .sort((left, right) => left.index - right.index)
      .map((toolCall) => ({
        ...(toolCall.id ? { id: toolCall.id } : {}),
        type: toolCall.type ?? "function",
        function: this.buildFunctionCallPayload(toolCall.function ?? { arguments: "" }),
      }));
  }
}

export function detectStreamingKind(
  method: string,
  pathname: string,
  parsedBody?: Record<string, unknown>,
): Exclude<ActiveConnectionKind, "other"> | undefined {
  if (method !== "POST" || !parsedBody) {
    return undefined;
  }

  if (pathname === "/v1/chat/completions") {
    return "chat.completions";
  }

  if (pathname === "/v1/completions") {
    return "completions";
  }

  return undefined;
}

export function splitSseBlocks(buffer: string, flush: boolean): ParsedSseBlockResult {
  const blocks: string[] = [];
  let remainder = buffer;

  while (true) {
    const windowsBreak = remainder.indexOf("\r\n\r\n");
    const unixBreak = remainder.indexOf("\n\n");
    let breakIndex = -1;
    let breakLength = 0;

    if (windowsBreak >= 0 && (unixBreak === -1 || windowsBreak < unixBreak)) {
      breakIndex = windowsBreak;
      breakLength = 4;
    } else if (unixBreak >= 0) {
      breakIndex = unixBreak;
      breakLength = 2;
    }

    if (breakIndex === -1) {
      break;
    }

    blocks.push(remainder.slice(0, breakIndex));
    remainder = remainder.slice(breakIndex + breakLength);
  }

  if (flush && remainder.trim()) {
    blocks.push(remainder);
    remainder = "";
  }

  return { blocks, remainder };
}

export function extractSseDataPayload(block: string): string | undefined {
  const dataLines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return undefined;
  }

  return dataLines.join("\n");
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}
