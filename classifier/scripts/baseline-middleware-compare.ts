import { isAbsolute, resolve } from "node:path";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";

interface EvalRow {
  rowIndex: number;
  prompt: string;
  trueLabel: string;
  scattering: number | null;
  subject: string | null;
}

interface ChatCompletionChoice {
  message?: {
    content?: string | null;
    reasoning_content?: string | null;
  } | null;
  finish_reason?: string | null;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: ChatCompletionChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

interface CompletionCallResult {
  body: ChatCompletionResponse;
  requestId: string | null;
}

interface DiagnosticsEntry {
  id?: string;
  latencyMs?: number;
  queuedMs?: number;
  generationMs?: number;
  completionTokens?: number;
  contentTokens?: number;
  reasoningTokens?: number;
  finishReason?: string | null;
  metricsExact?: boolean;
  timeToFirstTokenMs?: number;
}

interface DiagnosticsResponse {
  detail?: {
    entry?: DiagnosticsEntry;
  };
}

interface ModelResult {
  name: string;
  kind: "direct" | "middleware";
  answer: string | null;
  correct: boolean;
  truncated: boolean;
  proxyRequestId: string | null;
  routedModel: string;
  finishReason: string | null;
  thinkingObserved: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  answerTokens: number | null;
  totalTokens: number | null;
  durationMs: number;
  providerLatencyMs: number | null;
  queuedMs: number | null;
  generationMs: number | null;
  timeToFirstTokenMs: number | null;
  metricsExact: boolean | null;
}

interface CombinedRow {
  index: number;
  trueLabel: string;
  scattering: number | null;
  subject: string | null;
  prompt: string;
  results: Record<string, ModelResult>;
}

interface ScoreSummary {
  name: string;
  kind: "direct" | "middleware";
  accuracy: number;
  correct: number;
  total: number;
  thinkingRows: number;
  tokenSplitRows: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalReasoningTokensKnown: number;
  totalAnswerTokensKnown: number;
  totalDurationMs: number;
  averageDurationMs: number;
  routedModels: Record<string, number>;
  agreesWithSmall: number;
  agreesWithLarge: number;
}

interface ComparisonReport {
  generatedAt: string;
  endpoint: string;
  dataset: string;
  rowsEvaluated: number;
  smallModel: string;
  largeModel: string;
  middlewareModels: string[];
  directDisagreementRows: number;
  directAgreementRows: number;
  summaries: ScoreSummary[];
}

interface CachedResultEnvelope {
  savedAt: string;
  datasetPath: string;
  rowIndex: number;
  trueLabel: string;
  scattering: number | null;
  subject: string | null;
  promptHash: string;
  mode: "direct" | "middleware-routing";
  requestedModel: string;
  result: ModelResult;
}

interface ResultCacheFile {
  version: number;
  entries: Record<string, CachedResultEnvelope>;
}

class RetryableHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

class HttpResponseError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

class MissingAnswerError extends Error {}

const DEFAULT_ENDPOINT = "https://llmproxy.frugalai.haupt.dev/v1/chat/completions";
const DEFAULT_DATASET = resolve(process.cwd(), "../evaluation_data/evaluation_dataset_highScattered.csv");
const DEFAULT_LIMIT = 30;
const DEFAULT_SMALL_MODEL = "gpt-oss-120b-working";
const DEFAULT_LARGE_MODEL = "minimax-m2.5-229b";
const DEFAULT_MIDDLEWARES = [
  "middleware:simple",
  "middleware:onnx",
  "middleware:llm",
];
const DEFAULT_BASELINE_MAX_TOKENS = 10000;
const DEFAULT_MIDDLEWARE_INITIAL_TOKENS = 32;
const DEFAULT_MIDDLEWARE_MAX_TOKENS = 32;
const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_MAX_RETRIES = 10;
const DEFAULT_RETRY_DELAY_MS = 10000;
const CACHE_VERSION = 5;
const ANSWER_ONLY_SYSTEM_PROMPT =
  "You are solving a multiple-choice question. Reply with exactly one uppercase letter: A, B, C, or D. No explanation.";

function resolveCliPath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function parseArgs(argv: string[]) {
  let dataset = DEFAULT_DATASET;
  let endpoint = DEFAULT_ENDPOINT;
  let limit = DEFAULT_LIMIT;
  let outputDir = resolve(process.cwd(), "../tmp");
  let smallModel = DEFAULT_SMALL_MODEL;
  let largeModel = DEFAULT_LARGE_MODEL;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let baselineMaxTokens = DEFAULT_BASELINE_MAX_TOKENS;
  let middlewareInitialTokens = DEFAULT_MIDDLEWARE_INITIAL_TOKENS;
  let middlewareMaxTokens = DEFAULT_MIDDLEWARE_MAX_TOKENS;
  let maxRetries = DEFAULT_MAX_RETRIES;
  let retryDelayMs = DEFAULT_RETRY_DELAY_MS;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dataset") {
      dataset = resolveCliPath(argv[++i]!);
      continue;
    }
    if (arg === "--endpoint") {
      endpoint = argv[++i]!;
      continue;
    }
    if (arg === "--limit") {
      limit = Number.parseInt(argv[++i]!, 10);
      continue;
    }
    if (arg === "--output-dir") {
      outputDir = resolveCliPath(argv[++i]!);
      continue;
    }
    if (arg === "--small-model") {
      smallModel = argv[++i]!;
      continue;
    }
    if (arg === "--large-model") {
      largeModel = argv[++i]!;
      continue;
    }
    if (arg === "--timeout-ms") {
      timeoutMs = Number.parseInt(argv[++i]!, 10);
      continue;
    }
    if (arg === "--baseline-max-tokens") {
      baselineMaxTokens = Number.parseInt(argv[++i]!, 10);
      continue;
    }
    if (arg === "--middleware-initial-tokens") {
      middlewareInitialTokens = Number.parseInt(argv[++i]!, 10);
      continue;
    }
    if (arg === "--middleware-max-tokens") {
      middlewareMaxTokens = Number.parseInt(argv[++i]!, 10);
      continue;
    }
    if (arg === "--max-retries") {
      maxRetries = Number.parseInt(argv[++i]!, 10);
      continue;
    }
    if (arg === "--retry-delay-ms") {
      retryDelayMs = Number.parseInt(argv[++i]!, 10);
      continue;
    }
    if (arg === "--help") {
      console.log(`Usage:
  bun run scripts/baseline-middleware-compare.ts [options]

Options:
  --dataset <path>
  --endpoint <url>
  --limit <n>                      default: 30
  --output-dir <path>              default: ../tmp
  --small-model <name>             default: ${DEFAULT_SMALL_MODEL}
  --large-model <name>             default: ${DEFAULT_LARGE_MODEL}
  --timeout-ms <n>                 default: ${DEFAULT_TIMEOUT_MS}
  --baseline-max-tokens <n>        default: ${DEFAULT_BASELINE_MAX_TOKENS}
  --middleware-initial-tokens <n>  default: ${DEFAULT_MIDDLEWARE_INITIAL_TOKENS}
  --middleware-max-tokens <n>      default: ${DEFAULT_MIDDLEWARE_MAX_TOKENS}
  --max-retries <n>                default: ${DEFAULT_MAX_RETRIES}
  --retry-delay-ms <n>             default: ${DEFAULT_RETRY_DELAY_MS}
`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    dataset,
    endpoint,
    limit,
    outputDir,
    smallModel,
    largeModel,
    timeoutMs,
    baselineMaxTokens,
    middlewareInitialTokens,
    middlewareMaxTokens,
    maxRetries,
    retryDelayMs,
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        currentField += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i++;
      }
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.length > 1 || currentRow[0] !== "") {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  currentRow.push(currentField);
  if (currentRow.length > 1 || currentRow[0] !== "") {
    rows.push(currentRow);
  }

  return rows;
}

async function loadDataset(path: string, limit: number): Promise<EvalRow[]> {
  const csvText = await Bun.file(path).text();
  const rows = parseCsv(csvText);
  const header = rows[0]!;
  const promptIndex = header.indexOf("prompt");
  const trueLabelIndex = header.indexOf("true_label");
  const scatteringIndex = header.indexOf("scattering");
  const subjectIndex = header.indexOf("mmlu_subject");

  return rows.slice(1, limit + 1).map((row, index) => ({
    rowIndex: index + 1,
    prompt: row[promptIndex] ?? "",
    trueLabel: (row[trueLabelIndex] ?? "").trim().toUpperCase(),
    scattering:
      scatteringIndex >= 0 && row[scatteringIndex] && row[scatteringIndex] !== ""
        ? Number.parseFloat(row[scatteringIndex]!)
        : null,
    subject: subjectIndex >= 0 && row[subjectIndex] && row[subjectIndex] !== "" ? row[subjectIndex]! : null,
  }));
}

function normalizeLabel(text: string | null | undefined): string | null {
  if (!text) {
    return null;
  }
  const trimmed = text.trim().toUpperCase();
  if (/^[ABCD]$/.test(trimmed)) {
    return trimmed;
  }
  const answerMatch = trimmed.match(/(?:^|[\s"'`:([])([ABCD])(?:[\s"'`)\].,:;!?]|$)/);
  if (answerMatch) {
    return answerMatch[1] ?? null;
  }
  return null;
}

function getContent(choice: ChatCompletionChoice | undefined): string | null {
  const content = choice?.message?.content?.trim();
  return content && content.length > 0 ? content : null;
}

function getReasoning(choice: ChatCompletionChoice | undefined): string | null {
  const reasoning = choice?.message?.reasoning_content?.trim();
  return reasoning && reasoning.length > 0 ? reasoning : null;
}

function escapeCsv(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

function buildCacheKey(
  datasetPath: string,
  rowIndex: number,
  endpoint: string,
  model: string,
  prompt: string,
  initialTokens: number,
  maxTokens: number,
  mode: "direct" | "middleware-routing",
): string {
  return `${CACHE_VERSION}::${mode}::${datasetPath}::${rowIndex}::${endpoint}::${model}::${initialTokens}::${maxTokens}::${hashPrompt(prompt)}`;
}

function normalizeModelId(model: string): string {
  return model.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function resolveBaselineModelForRoute(routedModel: string, smallModel: string, largeModel: string): string | null {
  const routed = normalizeModelId(routedModel);
  const small = normalizeModelId(smallModel);
  const large = normalizeModelId(largeModel);

  if (routed === small || routed.includes(small) || small.includes(routed)) {
    return smallModel;
  }
  if (routed === large || routed.includes(large) || large.includes(routed)) {
    return largeModel;
  }

  return null;
}

async function loadCache(cachePath: string): Promise<ResultCacheFile> {
  const file = Bun.file(cachePath);
  if (!(await file.exists())) {
    return { version: CACHE_VERSION, entries: {} };
  }

  const parsed = JSON.parse(await file.text()) as Partial<ResultCacheFile>;
  if (parsed.version !== CACHE_VERSION || !parsed.entries) {
    return { version: CACHE_VERSION, entries: {} };
  }

  return {
    version: CACHE_VERSION,
    entries: parsed.entries,
  };
}

async function saveCache(cachePath: string, cache: ResultCacheFile): Promise<void> {
  await Bun.write(cachePath, JSON.stringify(cache, null, 2));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCompletion(
  endpoint: string,
  model: string,
  prompt: string,
  timeoutMs: number,
  maxCompletionTokens: number,
): Promise<CompletionCallResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: maxCompletionTokens,
      messages: [
        { role: "system", content: ANSWER_ONLY_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const message = `HTTP ${response.status} ${response.statusText}: ${body}`;
    if (response.status === 429 || response.status === 503) {
      throw new RetryableHttpError(response.status, message);
    }
    throw new HttpResponseError(response.status, message);
  }

  return {
    body: (await response.json()) as ChatCompletionResponse,
    requestId: response.headers.get("x-ai-proxy-request-id"),
  };
}

function diagnosticsUrl(endpoint: string, requestId: string): string {
  const url = new URL(endpoint);
  return `${url.origin}/api/llmproxy/admin/diagnostics/requests/${requestId}`;
}

async function fetchDiagnostics(
  endpoint: string,
  requestId: string,
  timeoutMs: number,
  maxRetries: number,
  retryDelayMs: number,
): Promise<DiagnosticsEntry | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(diagnosticsUrl(endpoint, requestId), {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      const data = (await response.json()) as DiagnosticsResponse;
      return data.detail?.entry ?? null;
    }

    if ((response.status === 404 || response.status === 202 || response.status === 503) && attempt < maxRetries) {
      await sleep(retryDelayMs * (attempt + 1));
      continue;
    }

    const body = await response.text();
    throw new Error(`Diagnostics lookup failed for ${requestId}: HTTP ${response.status} ${response.statusText}: ${body}`);
  }

  return null;
}

async function completeWithRetries(
  endpoint: string,
  model: string,
  prompt: string,
  timeoutMs: number,
  initialTokens: number,
  maxTokens: number,
  maxRetries: number,
  retryDelayMs: number,
): Promise<CompletionCallResult> {
  let attempt = 0;

  while (true) {
    try {
      return await fetchCompletion(endpoint, model, prompt, timeoutMs, Math.min(initialTokens, maxTokens));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        error instanceof RetryableHttpError ||
        (error instanceof DOMException && error.name === "TimeoutError") ||
        (error instanceof Error &&
          (message.includes("UNKNOWN_CERTIFICATE_VERIFICATION_ERROR") ||
            message.includes("certificate verification error") ||
            message.includes("network") ||
            message.includes("socket") ||
            message.includes("ECONN") ||
            /^HTTP 5\d\d\b/.test(message)));

      if (!retryable || attempt >= maxRetries) {
        throw error;
      }

      attempt++;
      const delay = retryDelayMs * attempt;
      console.warn(`[${model}] retry ${attempt}/${maxRetries} after transient error: ${message}. Waiting ${delay}ms.`);
      await sleep(delay);
    }
  }
}

async function evaluateModel(
  rows: EvalRow[],
  datasetPath: string,
  endpoint: string,
  model: string,
  kind: "direct" | "middleware",
  initialTokens: number,
  maxTokens: number,
  timeoutMs: number,
  maxRetries: number,
  retryDelayMs: number,
  cache: ResultCacheFile,
  cachePath: string,
): Promise<ModelResult[]> {
  const results: ModelResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const cacheKey = buildCacheKey(datasetPath, row.rowIndex, endpoint, model, row.prompt, initialTokens, maxTokens, "direct");
    const cached = cache.entries[cacheKey];
    if (cached) {
      results.push(cached.result);
      console.log(
        `[${model}] ${i + 1}/${rows.length} cache expected=${row.trueLabel} got=${cached.result.answer ?? "?"} routed=${cached.result.routedModel}`,
      );
      continue;
    }

    const startedAt = Date.now();
    const completion = await completeWithRetries(
      endpoint,
      model,
      row.prompt,
      timeoutMs,
      initialTokens,
      maxTokens,
      maxRetries,
      retryDelayMs,
    );
    const durationMs = Date.now() - startedAt;
    const diagnostics = completion.requestId
      ? await fetchDiagnostics(endpoint, completion.requestId, timeoutMs, maxRetries, retryDelayMs)
      : null;

    const choice = completion.body.choices?.[0];
    const content = getContent(choice);
    const reasoning = getReasoning(choice);
    const truncated = content === null && choice?.finish_reason === "length";
    let answer: string | null = null;
    if (content !== null) {
      answer = normalizeLabel(content);
    }
    if (content !== null && answer === null) {
      throw new Error(`Unparseable answer for ${model} on row ${i + 1}: ${JSON.stringify(content)}`);
    }
    if (content === null && choice?.finish_reason !== "length") {
      throw new MissingAnswerError(`Model ${model} produced no assistant content after retries`);
    }

    const completionTokens = diagnostics?.completionTokens ?? completion.body.usage?.completion_tokens ?? null;
    const reasoningTokens = diagnostics?.reasoningTokens ?? completion.body.usage?.completion_tokens_details?.reasoning_tokens ?? null;
    const answerTokens = diagnostics?.contentTokens ?? (
      completionTokens !== null && reasoningTokens !== null ? Math.max(0, completionTokens - reasoningTokens) : null
    );

    const result: ModelResult = {
      name: model,
      kind,
      answer,
      correct: answer !== null && answer === row.trueLabel,
      truncated,
      proxyRequestId: completion.requestId,
      routedModel: completion.body.model ?? model,
      finishReason: diagnostics?.finishReason ?? choice?.finish_reason ?? null,
      thinkingObserved: reasoning !== null,
      promptTokens: completion.body.usage?.prompt_tokens ?? null,
      completionTokens,
      reasoningTokens,
      answerTokens,
      totalTokens: completionTokens,
      durationMs,
      providerLatencyMs: diagnostics?.latencyMs ?? null,
      queuedMs: diagnostics?.queuedMs ?? null,
      generationMs: diagnostics?.generationMs ?? null,
      timeToFirstTokenMs: diagnostics?.timeToFirstTokenMs ?? null,
      metricsExact: diagnostics?.metricsExact ?? null,
    };
    results.push(result);
    cache.entries[cacheKey] = {
      savedAt: new Date().toISOString(),
      datasetPath,
      rowIndex: row.rowIndex,
      trueLabel: row.trueLabel,
      scattering: row.scattering,
      subject: row.subject,
      promptHash: hashPrompt(row.prompt),
      mode: "direct",
      requestedModel: model,
      result,
    };
    await saveCache(cachePath, cache);
    const status = result.correct ? "ok" : truncated ? "truncated" : "miss";
    console.log(`[${model}] ${i + 1}/${rows.length} ${status} expected=${row.trueLabel} got=${answer ?? "?"} routed=${result.routedModel}`);
  }

  return results;
}

async function evaluateMiddlewareByRouting(
  rows: EvalRow[],
  datasetPath: string,
  endpoint: string,
  middleware: string,
  initialTokens: number,
  maxTokens: number,
  timeoutMs: number,
  maxRetries: number,
  retryDelayMs: number,
  cache: ResultCacheFile,
  cachePath: string,
  smallModel: string,
  largeModel: string,
  directResults: Record<string, ModelResult[]>,
): Promise<ModelResult[]> {
  const results: ModelResult[] = [];
  let middlewareUnavailableReason: string | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const cacheKey = buildCacheKey(datasetPath, row.rowIndex, endpoint, middleware, row.prompt, initialTokens, maxTokens, "middleware-routing");
    const cached = cache.entries[cacheKey];
    if (cached) {
      results.push(cached.result);
      console.log(
        `[${middleware}] ${i + 1}/${rows.length} cache expected=${row.trueLabel} got=${cached.result.answer ?? "?"} routed=${cached.result.routedModel}`,
      );
      continue;
    }

    if (middlewareUnavailableReason !== null) {
      const result: ModelResult = {
        name: middleware,
        kind: "middleware",
        answer: null,
        correct: false,
        truncated: false,
        proxyRequestId: null,
        routedModel: middleware,
        finishReason: "middleware_unavailable",
        thinkingObserved: false,
        promptTokens: null,
        completionTokens: null,
        reasoningTokens: null,
        answerTokens: null,
        totalTokens: null,
        durationMs: 0,
        providerLatencyMs: null,
        queuedMs: null,
        generationMs: null,
        timeToFirstTokenMs: null,
        metricsExact: null,
      };
      results.push(result);
      cache.entries[cacheKey] = {
        savedAt: new Date().toISOString(),
        datasetPath,
        rowIndex: row.rowIndex,
        trueLabel: row.trueLabel,
        scattering: row.scattering,
        subject: row.subject,
        promptHash: hashPrompt(row.prompt),
        mode: "middleware-routing",
        requestedModel: middleware,
        result,
      };
      await saveCache(cachePath, cache);
      console.warn(`[${middleware}] ${i + 1}/${rows.length} recorded as unavailable: ${middlewareUnavailableReason}`);
      continue;
    }

    const startedAt = Date.now();
    let result: ModelResult;

    try {
      const completion = await completeWithRetries(
        endpoint,
        middleware,
        row.prompt,
        timeoutMs,
        initialTokens,
        maxTokens,
        maxRetries,
        retryDelayMs,
      );

      const routedModel = completion.body.model ?? middleware;
      const selectedBaselineModel = resolveBaselineModelForRoute(routedModel, smallModel, largeModel);
      const selectedResult = selectedBaselineModel ? directResults[selectedBaselineModel]?.[i] ?? null : null;
      const choice = completion.body.choices?.[0];
      const reasoning = getReasoning(choice);

      result = {
        name: middleware,
        kind: "middleware",
        answer: selectedResult?.answer ?? null,
        correct: selectedResult?.correct ?? false,
        truncated: selectedResult?.truncated ?? false,
        proxyRequestId: completion.requestId,
        routedModel,
        finishReason: choice?.finish_reason ?? null,
        thinkingObserved: reasoning !== null,
        promptTokens: selectedResult?.promptTokens ?? null,
        completionTokens: selectedResult?.completionTokens ?? null,
        reasoningTokens: selectedResult?.reasoningTokens ?? null,
        answerTokens: selectedResult?.answerTokens ?? null,
        totalTokens: selectedResult?.totalTokens ?? null,
        durationMs: selectedResult?.durationMs ?? 0,
        providerLatencyMs: selectedResult?.providerLatencyMs ?? null,
        queuedMs: selectedResult?.queuedMs ?? null,
        generationMs: selectedResult?.generationMs ?? null,
        timeToFirstTokenMs: selectedResult?.timeToFirstTokenMs ?? null,
        metricsExact: selectedResult?.metricsExact ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAt;
      const middlewareFailure =
        (error instanceof HttpResponseError && (error.status === 404 || error.status >= 500 || message.toLowerCase().includes("not found"))) ||
        (error instanceof RetryableHttpError && error.status >= 500);

      if (!middlewareFailure) {
        throw error;
      }

      if (
        (error instanceof HttpResponseError && error.status >= 500) ||
        (error instanceof RetryableHttpError && error.status >= 500)
      ) {
        middlewareUnavailableReason = message;
      }

      result = {
        name: middleware,
        kind: "middleware",
        answer: null,
        correct: false,
        truncated: false,
        proxyRequestId: null,
        routedModel: middleware,
        finishReason: `http_${error.status}`,
        thinkingObserved: false,
        promptTokens: null,
        completionTokens: null,
        reasoningTokens: null,
        answerTokens: null,
        totalTokens: null,
        durationMs,
        providerLatencyMs: null,
        queuedMs: null,
        generationMs: null,
        timeToFirstTokenMs: null,
        metricsExact: null,
      };
      console.warn(`[${middleware}] ${i + 1}/${rows.length} routing failure recorded: ${message}`);
    }

    results.push(result);
    cache.entries[cacheKey] = {
      savedAt: new Date().toISOString(),
      datasetPath,
      rowIndex: row.rowIndex,
      trueLabel: row.trueLabel,
      scattering: row.scattering,
      subject: row.subject,
      promptHash: hashPrompt(row.prompt),
      mode: "middleware-routing",
      requestedModel: middleware,
      result,
    };
    await saveCache(cachePath, cache);
    const status = result.correct ? "ok" : result.truncated ? "truncated" : "miss";
    console.log(
      `[${middleware}] ${i + 1}/${rows.length} ${status} expected=${row.trueLabel} got=${result.answer ?? "?"} routed=${result.routedModel}`,
    );
  }

  return results;
}

function buildCombinedRows(
  rows: EvalRow[],
  resultSets: Record<string, ModelResult[]>,
): CombinedRow[] {
  return rows.map((row, index) => {
    const results: Record<string, ModelResult> = {};
    for (const [name, set] of Object.entries(resultSets)) {
      results[name] = set[index]!;
    }
    return {
      index: index + 1,
      trueLabel: row.trueLabel,
      scattering: row.scattering,
      subject: row.subject,
      prompt: row.prompt,
      results,
    };
  });
}

function buildSummary(name: string, kind: "direct" | "middleware", rows: CombinedRow[], smallModel: string, largeModel: string): ScoreSummary {
  const routedModels: Record<string, number> = {};
  let correct = 0;
  let thinkingRows = 0;
  let tokenSplitRows = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalReasoningTokensKnown = 0;
  let totalAnswerTokensKnown = 0;
  let totalDurationMs = 0;
  let agreesWithSmall = 0;
  let agreesWithLarge = 0;

  for (const row of rows) {
    const result = row.results[name]!;
    if (result.correct) {
      correct++;
    }
    if (result.thinkingObserved) {
      thinkingRows++;
    }
    totalPromptTokens += result.promptTokens ?? 0;
    totalCompletionTokens += result.completionTokens ?? 0;
    totalDurationMs += result.durationMs;
    if (result.reasoningTokens !== null && result.answerTokens !== null) {
      tokenSplitRows++;
      totalReasoningTokensKnown += result.reasoningTokens;
      totalAnswerTokensKnown += result.answerTokens;
    }
    routedModels[result.routedModel] = (routedModels[result.routedModel] ?? 0) + 1;
    if (result.answer !== null && row.results[smallModel]!.answer !== null && result.answer === row.results[smallModel]!.answer) {
      agreesWithSmall++;
    }
    if (result.answer !== null && row.results[largeModel]!.answer !== null && result.answer === row.results[largeModel]!.answer) {
      agreesWithLarge++;
    }
  }

  return {
    name,
    kind,
    accuracy: correct / rows.length,
    correct,
    total: rows.length,
    thinkingRows,
    tokenSplitRows,
    totalPromptTokens,
    totalCompletionTokens,
    totalReasoningTokensKnown,
    totalAnswerTokensKnown,
    totalDurationMs,
    averageDurationMs: totalDurationMs / rows.length,
    routedModels,
    agreesWithSmall,
    agreesWithLarge,
  };
}

function renderBaselineCsv(rows: CombinedRow[], smallModel: string, largeModel: string): string {
  const header = [
    "row_index",
    "true_label",
    "scattering",
    "mmlu_subject",
    "prompt",
    "small_model",
    "small_proxy_request_id",
    "small_answer",
    "small_correct",
    "small_truncated",
    "small_prompt_tokens",
    "small_completion_tokens",
    "small_reasoning_tokens",
    "small_answer_tokens",
    "small_total_tokens",
    "small_duration_ms",
    "small_provider_latency_ms",
    "small_queued_ms",
    "small_generation_ms",
    "small_ttft_ms",
    "large_model",
    "large_proxy_request_id",
    "large_answer",
    "large_correct",
    "large_truncated",
    "large_prompt_tokens",
    "large_completion_tokens",
    "large_reasoning_tokens",
    "large_answer_tokens",
    "large_total_tokens",
    "large_duration_ms",
    "large_provider_latency_ms",
    "large_queued_ms",
    "large_generation_ms",
    "large_ttft_ms",
  ];
  const lines = [header.join(",")];

  for (const row of rows) {
    const small = row.results[smallModel]!;
    const large = row.results[largeModel]!;
    lines.push([
      row.index,
      row.trueLabel,
      row.scattering,
      row.subject,
      row.prompt,
      smallModel,
      small.proxyRequestId,
      small.answer,
      small.correct,
      small.truncated,
      small.promptTokens,
      small.completionTokens,
      small.reasoningTokens,
      small.answerTokens,
      small.totalTokens,
      small.durationMs,
      small.providerLatencyMs,
      small.queuedMs,
      small.generationMs,
      small.timeToFirstTokenMs,
      largeModel,
      large.proxyRequestId,
      large.answer,
      large.correct,
      large.truncated,
      large.promptTokens,
      large.completionTokens,
      large.reasoningTokens,
      large.answerTokens,
      large.totalTokens,
      large.durationMs,
      large.providerLatencyMs,
      large.queuedMs,
      large.generationMs,
      large.timeToFirstTokenMs,
    ].map(escapeCsv).join(","));
  }

  return lines.join("\n") + "\n";
}

function renderCombinedCsv(rows: CombinedRow[], smallModel: string, largeModel: string, middlewareNames: string[]): string {
  const header = [
    "row_index",
    "true_label",
    "scattering",
    "mmlu_subject",
    `${smallModel}_answer`,
    `${smallModel}_correct`,
    `${smallModel}_proxy_request_id`,
    `${smallModel}_truncated`,
    `${smallModel}_prompt_tokens`,
    `${smallModel}_completion_tokens`,
    `${smallModel}_reasoning_tokens`,
    `${smallModel}_answer_tokens`,
    `${smallModel}_total_tokens`,
    `${smallModel}_duration_ms`,
    `${smallModel}_provider_latency_ms`,
    `${smallModel}_queued_ms`,
    `${smallModel}_generation_ms`,
    `${smallModel}_ttft_ms`,
    `${largeModel}_answer`,
    `${largeModel}_correct`,
    `${largeModel}_proxy_request_id`,
    `${largeModel}_truncated`,
    `${largeModel}_prompt_tokens`,
    `${largeModel}_completion_tokens`,
    `${largeModel}_reasoning_tokens`,
    `${largeModel}_answer_tokens`,
    `${largeModel}_total_tokens`,
    `${largeModel}_duration_ms`,
    `${largeModel}_provider_latency_ms`,
    `${largeModel}_queued_ms`,
    `${largeModel}_generation_ms`,
    `${largeModel}_ttft_ms`,
  ];

  for (const middleware of middlewareNames) {
    header.push(
      `${middleware}_answer`,
      `${middleware}_correct`,
      `${middleware}_routed_model`,
      `${middleware}_proxy_request_id`,
      `${middleware}_truncated`,
      `${middleware}_prompt_tokens`,
      `${middleware}_completion_tokens`,
      `${middleware}_reasoning_tokens`,
      `${middleware}_answer_tokens`,
      `${middleware}_total_tokens`,
      `${middleware}_duration_ms`,
      `${middleware}_provider_latency_ms`,
      `${middleware}_queued_ms`,
      `${middleware}_generation_ms`,
      `${middleware}_ttft_ms`,
    );
  }

  const lines = [header.map(escapeCsv).join(",")];
  for (const row of rows) {
    const values: Array<string | number | boolean | null> = [
      row.index,
      row.trueLabel,
      row.scattering,
      row.subject,
      row.results[smallModel]!.answer,
      row.results[smallModel]!.correct,
      row.results[smallModel]!.proxyRequestId,
      row.results[smallModel]!.truncated,
      row.results[smallModel]!.promptTokens,
      row.results[smallModel]!.completionTokens,
      row.results[smallModel]!.reasoningTokens,
      row.results[smallModel]!.answerTokens,
      row.results[smallModel]!.totalTokens,
      row.results[smallModel]!.durationMs,
      row.results[smallModel]!.providerLatencyMs,
      row.results[smallModel]!.queuedMs,
      row.results[smallModel]!.generationMs,
      row.results[smallModel]!.timeToFirstTokenMs,
      row.results[largeModel]!.answer,
      row.results[largeModel]!.correct,
      row.results[largeModel]!.proxyRequestId,
      row.results[largeModel]!.truncated,
      row.results[largeModel]!.promptTokens,
      row.results[largeModel]!.completionTokens,
      row.results[largeModel]!.reasoningTokens,
      row.results[largeModel]!.answerTokens,
      row.results[largeModel]!.totalTokens,
      row.results[largeModel]!.durationMs,
      row.results[largeModel]!.providerLatencyMs,
      row.results[largeModel]!.queuedMs,
      row.results[largeModel]!.generationMs,
      row.results[largeModel]!.timeToFirstTokenMs,
    ];
    for (const middleware of middlewareNames) {
      const result = row.results[middleware]!;
      values.push(
        result.answer,
        result.correct,
        result.routedModel,
        result.proxyRequestId,
        result.truncated,
        result.promptTokens,
        result.completionTokens,
        result.reasoningTokens,
        result.answerTokens,
        result.totalTokens,
        result.durationMs,
        result.providerLatencyMs,
        result.queuedMs,
        result.generationMs,
        result.timeToFirstTokenMs,
      );
    }
    lines.push(values.map(escapeCsv).join(","));
  }

  return lines.join("\n") + "\n";
}

function renderMarkdown(report: ComparisonReport): string {
  const lines: string[] = [
    "# Baseline vs Middleware Comparison",
    "",
    `- Generated at: \`${report.generatedAt}\``,
    `- Dataset: \`${report.dataset}\``,
    `- Rows evaluated: **${report.rowsEvaluated}**`,
    `- Direct small model: \`${report.smallModel}\``,
    `- Direct large model: \`${report.largeModel}\``,
    `- Middleware models: ${report.middlewareModels.map((name) => `\`${name}\``).join(", ")}`,
    `- Direct-model agreement: **${report.directAgreementRows}/${report.rowsEvaluated}**`,
    `- Direct-model disagreement: **${report.directDisagreementRows}/${report.rowsEvaluated}**`,
    "",
    "## Scoreboard",
    "",
    "| Name | Kind | Accuracy | Correct | Thinking Rows | Agree w/ Small | Agree w/ Large |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.summaries.map((summary) =>
      `| \`${summary.name}\` | ${summary.kind} | ${(summary.accuracy * 100).toFixed(2)}% | ${summary.correct}/${summary.total} | ${summary.thinkingRows}/${summary.total} | ${summary.agreesWithSmall}/${summary.total} | ${summary.agreesWithLarge}/${summary.total} |`,
    ),
    "",
    "## Routing Notes",
    "",
  ];

  for (const summary of report.summaries.filter((entry) => entry.kind === "middleware")) {
    lines.push(`### ${summary.name}`);
    lines.push("");
    const routed = Object.entries(summary.routedModels)
      .map(([model, count]) => `\`${model}\` (${count})`)
      .join(", ");
    lines.push(`- Routed backends: ${routed || "none"}`);
    lines.push(`- Total wall time: ${summary.totalDurationMs} ms, average per query: ${summary.averageDurationMs.toFixed(1)} ms`);
    if (summary.tokenSplitRows > 0) {
      lines.push(`- Known token split: answer=${summary.totalAnswerTokensKnown}, reasoning=${summary.totalReasoningTokensKnown}`);
    } else {
      lines.push(`- Token split metadata was not exposed by the endpoint.`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.outputDir, { recursive: true });
  const rows = await loadDataset(args.dataset, args.limit);
  const cachePath = resolve(args.outputDir, "highscattered_first30_result_cache.json");
  const cache = await loadCache(cachePath);

  console.log(`Dataset: ${args.dataset}`);
  console.log(`Rows:    ${rows.length}`);
  console.log(`Output:  ${args.outputDir}`);
  console.log(`Cache:   ${cachePath}`);

  const directModels = [args.smallModel, args.largeModel];
  const allResultSets: Record<string, ModelResult[]> = {};

  for (const model of directModels) {
    const results = await evaluateModel(
      rows,
      args.dataset,
      args.endpoint,
      model,
      "direct",
      args.baselineMaxTokens,
      args.baselineMaxTokens,
      args.timeoutMs,
      args.maxRetries,
      args.retryDelayMs,
      cache,
      cachePath,
    );
    allResultSets[model] = results;
  }

  const directResultLookup: Record<string, ModelResult[]> = {
    [args.smallModel]: allResultSets[args.smallModel]!,
    [args.largeModel]: allResultSets[args.largeModel]!,
  };

  for (const middleware of DEFAULT_MIDDLEWARES) {
    const results = await evaluateMiddlewareByRouting(
      rows,
      args.dataset,
      args.endpoint,
      middleware,
      args.middlewareInitialTokens,
      args.middlewareMaxTokens,
      args.timeoutMs,
      args.maxRetries,
      args.retryDelayMs,
      cache,
      cachePath,
      args.smallModel,
      args.largeModel,
      directResultLookup,
    );
    allResultSets[middleware] = results;
  }

  const combinedRows = buildCombinedRows(rows, allResultSets);
  const summaries = [
    buildSummary(args.smallModel, "direct", combinedRows, args.smallModel, args.largeModel),
    buildSummary(args.largeModel, "direct", combinedRows, args.smallModel, args.largeModel),
    ...DEFAULT_MIDDLEWARES.map((middleware) => buildSummary(middleware, "middleware", combinedRows, args.smallModel, args.largeModel)),
  ];

  const directAgreementRows = combinedRows.filter((row) => {
    const small = row.results[args.smallModel]!.answer;
    const large = row.results[args.largeModel]!.answer;
    return small !== null && large !== null && small === large;
  }).length;
  const report: ComparisonReport = {
    generatedAt: new Date().toISOString(),
    endpoint: args.endpoint,
    dataset: args.dataset,
    rowsEvaluated: combinedRows.length,
    smallModel: args.smallModel,
    largeModel: args.largeModel,
    middlewareModels: DEFAULT_MIDDLEWARES,
    directAgreementRows,
    directDisagreementRows: combinedRows.length - directAgreementRows,
    summaries,
  };

  const baselineCsvPath = resolve(args.outputDir, "highscattered_first30_direct_baseline.csv");
  const combinedCsvPath = resolve(args.outputDir, "highscattered_first30_all_results.csv");
  const jsonPath = resolve(args.outputDir, "highscattered_first30_comparison.json");
  const markdownPath = resolve(args.outputDir, "highscattered_first30_comparison.md");

  await Bun.write(baselineCsvPath, renderBaselineCsv(combinedRows, args.smallModel, args.largeModel));
  await Bun.write(combinedCsvPath, renderCombinedCsv(combinedRows, args.smallModel, args.largeModel, DEFAULT_MIDDLEWARES));
  await Bun.write(jsonPath, JSON.stringify(report, null, 2));
  await Bun.write(markdownPath, renderMarkdown(report));

  console.log(`\nWrote baseline CSV:   ${baselineCsvPath}`);
  console.log(`Wrote combined CSV:   ${combinedCsvPath}`);
  console.log(`Wrote JSON summary:   ${jsonPath}`);
  console.log(`Wrote Markdown note:  ${markdownPath}`);
  console.log(`Wrote cache file:     ${cachePath}`);
  console.log(`\nJSON summary:`);
  console.log(JSON.stringify(report, null, 2));
}

await main();
