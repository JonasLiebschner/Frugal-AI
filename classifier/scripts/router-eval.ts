interface EvalRow {
  prompt: string;
  true_label: string;
  scattering: number | null;
  mmlu_subject: string | null;
}

interface ChatCompletionChoice {
  message?: {
    content?: string | null;
    reasoning_content?: string | null;
  } | null;
  finish_reason?: string | null;
}

interface ChatCompletionResponse {
  id?: string;
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

interface SampleResult {
  index: number;
  trueLabel: string;
  predictedLabel: string | null;
  isCorrect: boolean;
  routedModel: string;
  routedSize: "small" | "large" | "unknown";
  finishReason: string | null;
  responseText: string | null;
  reasoningText: string | null;
  thinkingObserved: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  answerTokens: number | null;
  totalTokens: number | null;
  scattering: number | null;
  subject: string | null;
}

interface MissingAnswerErrorDetails {
  middleware: string;
  routedModel: string;
  finishReason: string | null;
  responseContent: string | null;
  reasoningPreview: string | null;
  maxCompletionTokens: number;
}

interface AggregateBucket {
  total: number;
  correct: number;
}

interface EvaluationSummary {
  middleware: string;
  datasetPath: string;
  datasetRows: number;
  evaluatedRows: number;
  accuracy: number;
  correct: number;
  byRoutedModel: Record<string, AggregateBucket>;
  byRoutedSize: Record<string, AggregateBucket>;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  rowsWithThinking: number;
  tokenSplitRows: number;
  totalReasoningTokensKnown: number;
  totalAnswerTokensKnown: number;
  totalTokens: number;
  invalidPredictions: number;
  sampleErrors: Array<{
    index: number;
    expected: string;
    got: string | null;
    routedModel: string;
    responseText: string | null;
    reasoningText: string | null;
  }>;
}

interface EvaluationReport {
  generatedAt: string;
  endpoint: string;
  dataset: string;
  rowsEvaluated: number;
  summaries: EvaluationSummary[];
}

class RetryableHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

class MissingAnswerError extends Error {
  readonly details: MissingAnswerErrorDetails;

  constructor(details: MissingAnswerErrorDetails) {
    super(
      `Model returned no assistant answer content (middleware=${details.middleware}, routed=${details.routedModel}, finish_reason=${details.finishReason ?? "unknown"}, max_completion_tokens=${details.maxCompletionTokens})`,
    );
    this.details = details;
  }
}

const DEFAULT_ENDPOINT = "https://llmproxy.frugalai.haupt.dev/v1/chat/completions";
const DEFAULT_DATASET = resolve(new URL("../..", import.meta.url).pathname, "evaluation_data/evaluation_dataset_highScattered.csv");
const DEFAULT_MIDDLEWARE = "middleware:simple";
const ANSWER_ONLY_SYSTEM_PROMPT =
  "You are solving a multiple-choice question. Reply with exactly one uppercase letter: A, B, C, or D. No explanation.";

function resolveCliPath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function usage() {
  console.log(`Usage:
  bun run scripts/router-eval.ts [options]

Options:
  --dataset <path>         CSV dataset path
  --middleware <name>      Middleware model name (repeatable)
  --endpoint <url>         OpenAI-compatible /v1/chat/completions endpoint
  --limit <n>              Number of rows to evaluate
  --concurrency <n>        Number of concurrent requests (default: 1)
  --timeout-ms <n>         Request timeout in milliseconds (default: 180000)
  --max-completion-tokens <n> Max completion tokens to request (default: 10000)
  --max-retries <n>        Retries for transient 429/503/timeout failures (default: 6)
  --retry-delay-ms <n>     Base backoff delay in milliseconds (default: 5000)
  --output <path>          Optional JSON output path
  --markdown <path>        Optional Markdown summary path
  --verbose-errors         Print full text for sampled mispredictions
  --help                   Show this message

Examples:
  bun run scripts/router-eval.ts --middleware middleware:simple --limit 50
  bun run scripts/router-eval.ts --middleware middleware:simple --output ../tmp/simple.json
  bun run scripts/router-eval.ts --middleware middleware:simple --middleware middleware:onnx --middleware middleware:llm
`);
}

function parseArgs(argv: string[]) {
  const middlewares: string[] = [];
  let dataset = DEFAULT_DATASET;
  let endpoint = DEFAULT_ENDPOINT;
  let limit: number | null = null;
  let concurrency = 1;
  let timeoutMs = 180000;
  let maxCompletionTokens = 10000;
  let maxRetries = 6;
  let retryDelayMs = 5000;
  let outputPath: string | null = null;
  let markdownPath: string | null = null;
  let verboseErrors = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help") {
      usage();
      process.exit(0);
    }

    if (arg === "--dataset") {
      dataset = resolveCliPath(argv[++i]!);
      continue;
    }

    if (arg === "--middleware") {
      middlewares.push(argv[++i]!);
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

    if (arg === "--concurrency") {
      concurrency = Number.parseInt(argv[++i]!, 10);
      continue;
    }

    if (arg === "--timeout-ms") {
      timeoutMs = Number.parseInt(argv[++i]!, 10);
      continue;
    }

    if (arg === "--max-completion-tokens") {
      maxCompletionTokens = Number.parseInt(argv[++i]!, 10);
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

    if (arg === "--output") {
      outputPath = resolveCliPath(argv[++i]!);
      continue;
    }

    if (arg === "--markdown") {
      markdownPath = resolveCliPath(argv[++i]!);
      continue;
    }

    if (arg === "--verbose-errors") {
      verboseErrors = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (middlewares.length === 0) {
    middlewares.push(DEFAULT_MIDDLEWARE);
  }

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`Invalid concurrency: ${concurrency}`);
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000) {
    throw new Error(`Invalid timeoutMs: ${timeoutMs}`);
  }

  if (!Number.isInteger(maxCompletionTokens) || maxCompletionTokens < 1) {
    throw new Error(`Invalid maxCompletionTokens: ${maxCompletionTokens}`);
  }

  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error(`Invalid maxRetries: ${maxRetries}`);
  }

  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0) {
    throw new Error(`Invalid retryDelayMs: ${retryDelayMs}`);
  }

  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error(`Invalid limit: ${limit}`);
  }

  if (markdownPath === null && outputPath !== null) {
    markdownPath = outputPath.replace(/\.json$/i, "") + ".md";
  }

  return {
    dataset,
    endpoint,
    middlewares,
    limit,
    concurrency,
    timeoutMs,
    maxCompletionTokens,
    maxRetries,
    retryDelayMs,
    outputPath,
    markdownPath,
    verboseErrors,
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

async function loadDataset(path: string): Promise<EvalRow[]> {
  const csvText = await Bun.file(path).text();
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error(`Dataset is empty: ${path}`);
  }

  const header = rows[0]!;
  const promptIndex = header.indexOf("prompt");
  const trueLabelIndex = header.indexOf("true_label");
  const scatteringIndex = header.indexOf("scattering");
  const subjectIndex = header.indexOf("mmlu_subject");

  if (promptIndex === -1 || trueLabelIndex === -1) {
    throw new Error(`Dataset header missing required columns: ${header.join(", ")}`);
  }

  return rows.slice(1).map((row) => ({
    prompt: row[promptIndex] ?? "",
    true_label: (row[trueLabelIndex] ?? "").trim().toUpperCase(),
    scattering:
      scatteringIndex >= 0 && row[scatteringIndex] && row[scatteringIndex] !== ""
        ? Number.parseFloat(row[scatteringIndex]!)
        : null,
    mmlu_subject: subjectIndex >= 0 && row[subjectIndex] && row[subjectIndex] !== "" ? row[subjectIndex]! : null,
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

  const firstMatch = trimmed.match(/[ABCD]/);
  return firstMatch?.[0] ?? null;
}

function inferRoutedSize(model: string | undefined): "small" | "large" | "unknown" {
  if (!model) {
    return "unknown";
  }

  const lower = model.toLowerCase();
  if (lower.includes("qwen")) {
    return "small";
  }
  if (lower.includes("gpt-5.4")) {
    return "large";
  }
  return "unknown";
}

function getResponseText(choice: ChatCompletionChoice | undefined): string | null {
  const content = choice?.message?.content?.trim();
  if (content && content.length > 0) {
    return content;
  }
  return null;
}

function getReasoningText(choice: ChatCompletionChoice | undefined): string | null {
  const reasoning = choice?.message?.reasoning_content?.trim();
  if (reasoning && reasoning.length > 0) {
    return reasoning;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCompletion(
  endpoint: string,
  middleware: string,
  prompt: string,
  timeoutMs: number,
  maxCompletionTokens: number,
): Promise<ChatCompletionResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: middleware,
      temperature: 0,
      max_completion_tokens: maxCompletionTokens,
      messages: [
        { role: "system", content: ANSWER_ONLY_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const message = `HTTP ${response.status} ${response.statusText}: ${errorBody}`;
    if (response.status === 429 || response.status === 503) {
      throw new RetryableHttpError(response.status, message);
    }
    throw new Error(message);
  }

  return (await response.json()) as ChatCompletionResponse;
}

async function runCompletionWithRetry(
  endpoint: string,
  middleware: string,
  prompt: string,
  timeoutMs: number,
  maxCompletionTokens: number,
  maxRetries: number,
  retryDelayMs: number,
): Promise<ChatCompletionResponse> {
  let attempt = 0;

  while (true) {
    try {
      return await runCompletion(endpoint, middleware, prompt, timeoutMs, maxCompletionTokens);
    } catch (error) {
      const isRetryable =
        error instanceof RetryableHttpError ||
        (error instanceof DOMException && error.name === "TimeoutError");

      if (!isRetryable || attempt >= maxRetries) {
        throw error;
      }

      attempt++;
      const delay = retryDelayMs * attempt;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[${middleware}] retry ${attempt}/${maxRetries} after transient error: ${message}. Waiting ${delay}ms before retrying.`,
      );
      await sleep(delay);
    }
  }
}

async function runCompletionUntilAnswer(
  endpoint: string,
  middleware: string,
  prompt: string,
  timeoutMs: number,
  maxCompletionTokens: number,
  maxRetries: number,
  retryDelayMs: number,
): Promise<ChatCompletionResponse> {
  let tokenBudget = maxCompletionTokens;

  while (true) {
    const response = await runCompletionWithRetry(
      endpoint,
      middleware,
      prompt,
      timeoutMs,
      tokenBudget,
      maxRetries,
      retryDelayMs,
    );
    const choice = response.choices?.[0];
    const responseText = getResponseText(choice);
    if (responseText !== null) {
      return response;
    }

    const missingAnswer = new MissingAnswerError({
      middleware,
      routedModel: response.model ?? "unknown",
      finishReason: choice?.finish_reason ?? null,
      responseContent: choice?.message?.content ?? null,
      reasoningPreview: getReasoningText(choice)?.slice(0, 300) ?? null,
      maxCompletionTokens: tokenBudget,
    });

    if (choice?.finish_reason === "length" && tokenBudget < 10000) {
      const nextBudget = Math.min(tokenBudget * 2, 10000);
      console.warn(
        `[${middleware}] empty assistant content with finish_reason=length at max_completion_tokens=${tokenBudget}; retrying same prompt with ${nextBudget}.`,
      );
      tokenBudget = nextBudget;
      continue;
    }

    throw missingAnswer;
  }
}

function incrementBucket(target: Record<string, AggregateBucket>, key: string, isCorrect: boolean) {
  const bucket = (target[key] ??= { total: 0, correct: 0 });
  bucket.total++;
  if (isCorrect) {
    bucket.correct++;
  }
}

function buildSummary(
  middleware: string,
  datasetPath: string,
  datasetRows: number,
  sampleResults: SampleResult[],
): EvaluationSummary {
  const byRoutedModel: Record<string, AggregateBucket> = {};
  const byRoutedSize: Record<string, AggregateBucket> = {};
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let rowsWithThinking = 0;
  let tokenSplitRows = 0;
  let totalReasoningTokensKnown = 0;
  let totalAnswerTokensKnown = 0;
  let totalTokens = 0;
  let correct = 0;
  let invalidPredictions = 0;

  for (const result of sampleResults) {
    if (result.isCorrect) {
      correct++;
    }
    if (result.predictedLabel === null) {
      invalidPredictions++;
    }
    incrementBucket(byRoutedModel, result.routedModel, result.isCorrect);
    incrementBucket(byRoutedSize, result.routedSize, result.isCorrect);
    totalPromptTokens += result.promptTokens ?? 0;
    totalCompletionTokens += result.completionTokens ?? 0;
    if (result.thinkingObserved) {
      rowsWithThinking++;
    }
    if (result.reasoningTokens !== null && result.answerTokens !== null) {
      tokenSplitRows++;
      totalReasoningTokensKnown += result.reasoningTokens;
      totalAnswerTokensKnown += result.answerTokens;
    }
    totalTokens += result.totalTokens ?? 0;
  }

  return {
    middleware,
    datasetPath,
    datasetRows,
    evaluatedRows: sampleResults.length,
    accuracy: sampleResults.length === 0 ? 0 : correct / sampleResults.length,
    correct,
    byRoutedModel,
    byRoutedSize,
    totalPromptTokens,
    totalCompletionTokens,
    rowsWithThinking,
    tokenSplitRows,
    totalReasoningTokensKnown,
    totalAnswerTokensKnown,
    totalTokens,
    invalidPredictions,
    sampleErrors: sampleResults
      .filter((result) => !result.isCorrect)
      .slice(0, 10)
      .map((result) => ({
        index: result.index,
        expected: result.trueLabel,
        got: result.predictedLabel,
        routedModel: result.routedModel,
        responseText: result.responseText,
        reasoningText: result.reasoningText,
      })),
  };
}

async function evaluateMiddleware(
  rows: EvalRow[],
  middleware: string,
  endpoint: string,
  concurrency: number,
  timeoutMs: number,
  maxCompletionTokens: number,
  maxRetries: number,
  retryDelayMs: number,
): Promise<{ summary: EvaluationSummary; results: SampleResult[] }> {
  const results = new Array<SampleResult>(rows.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= rows.length) {
        return;
      }

      const row = rows[currentIndex]!;
      const response = await runCompletionUntilAnswer(
        endpoint,
        middleware,
        row.prompt,
        timeoutMs,
        maxCompletionTokens,
        maxRetries,
        retryDelayMs,
      );
      const choice = response.choices?.[0];
      const responseText = getResponseText(choice);
      const reasoningText = getReasoningText(choice);
      if (responseText === null) {
        throw new MissingAnswerError({
          middleware,
          routedModel: response.model ?? "unknown",
          finishReason: choice?.finish_reason ?? null,
          responseContent: choice?.message?.content ?? null,
          reasoningPreview: reasoningText?.slice(0, 300) ?? null,
          maxCompletionTokens,
        });
      }
      const predictedLabel = normalizeLabel(responseText);
      const trueLabel = row.true_label;
      const routedModel = response.model ?? "unknown";
      const completionTokens = response.usage?.completion_tokens ?? null;
      const reasoningTokens = response.usage?.completion_tokens_details?.reasoning_tokens ?? null;
      const answerTokens =
        completionTokens !== null && reasoningTokens !== null ? Math.max(0, completionTokens - reasoningTokens) : null;
      results[currentIndex] = {
        index: currentIndex + 1,
        trueLabel,
        predictedLabel,
        isCorrect: predictedLabel === trueLabel,
        routedModel,
        routedSize: inferRoutedSize(response.model),
        finishReason: response.choices?.[0]?.finish_reason ?? null,
        responseText,
        reasoningText,
        thinkingObserved: reasoningText !== null,
        promptTokens: response.usage?.prompt_tokens ?? null,
        completionTokens,
        reasoningTokens,
        answerTokens,
        totalTokens: response.usage?.total_tokens ?? null,
        scattering: row.scattering,
        subject: row.mmlu_subject,
      };

      const progress = currentIndex + 1;
      const correctness = results[currentIndex]!.isCorrect ? "ok" : "miss";
      console.log(
        `[${middleware}] ${progress}/${rows.length} ${correctness} expected=${trueLabel} got=${predictedLabel ?? "?"} routed=${routedModel}`,
      );
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return {
    summary: buildSummary(middleware, "", rows.length, results),
    results,
  };
}

function printSummary(summary: EvaluationSummary, verboseErrors: boolean) {
  console.log(`\n=== ${summary.middleware} ===`);
  console.log(`Evaluated rows: ${summary.evaluatedRows}/${summary.datasetRows}`);
  console.log(`Accuracy:       ${(summary.accuracy * 100).toFixed(2)}% (${summary.correct}/${summary.evaluatedRows})`);
  console.log(`Invalid picks:  ${summary.invalidPredictions}`);
  console.log(`Token usage:    prompt=${summary.totalPromptTokens} completion=${summary.totalCompletionTokens} total=${summary.totalTokens}`);
  console.log(`Thinking rows:  ${summary.rowsWithThinking}/${summary.evaluatedRows}`);
  if (summary.tokenSplitRows > 0) {
    console.log(
      `Known split:    answer=${summary.totalAnswerTokensKnown} reasoning=${summary.totalReasoningTokensKnown} (available for ${summary.tokenSplitRows}/${summary.evaluatedRows} rows)`,
    );
  } else {
    console.log(`Known split:    unavailable from endpoint usage metadata`);
  }

  console.log(`Routed size breakdown:`);
  for (const [size, bucket] of Object.entries(summary.byRoutedSize)) {
    console.log(
      `  ${size.padEnd(7)} total=${String(bucket.total).padStart(3)} correct=${String(bucket.correct).padStart(3)} accuracy=${((bucket.correct / bucket.total) * 100).toFixed(2)}%`,
    );
  }

  console.log(`Routed model breakdown:`);
  for (const [model, bucket] of Object.entries(summary.byRoutedModel)) {
    console.log(
      `  ${model} total=${bucket.total} correct=${bucket.correct} accuracy=${((bucket.correct / bucket.total) * 100).toFixed(2)}%`,
    );
  }

  if (summary.sampleErrors.length > 0) {
    console.log(`Sample errors:`);
    for (const error of summary.sampleErrors) {
      const body = verboseErrors
        ? ` response=${JSON.stringify(error.responseText)} reasoning=${JSON.stringify(error.reasoningText)}`
        : "";
      console.log(
        `  #${error.index} expected=${error.expected} got=${error.got ?? "?"} routed=${error.routedModel}${body}`,
      );
    }
  }
}

function toPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function findBestSummary(summaries: EvaluationSummary[]): EvaluationSummary | null {
  if (summaries.length === 0) {
    return null;
  }

  return summaries.reduce((best, current) => (current.accuracy > best.accuracy ? current : best));
}

function findWorstSummary(summaries: EvaluationSummary[]): EvaluationSummary | null {
  if (summaries.length === 0) {
    return null;
  }

  return summaries.reduce((worst, current) => (current.accuracy < worst.accuracy ? current : worst));
}

function describeRouting(summary: EvaluationSummary): string {
  const routedModels = Object.entries(summary.byRoutedModel);
  if (routedModels.length === 0) {
    return "No routed model information was returned by the endpoint.";
  }

  if (routedModels.length === 1) {
    const [model, bucket] = routedModels[0]!;
    return `${summary.middleware} sent all ${bucket.total} evaluated prompts to \`${model}\`.`;
  }

  const dominant = routedModels.reduce((best, current) => (current[1].total > best[1].total ? current : best));
  return `${summary.middleware} used ${routedModels.length} routed models; the dominant backend was \`${dominant[0]}\` with ${dominant[1].total}/${summary.evaluatedRows} prompts.`;
}

function renderMarkdownReport(report: EvaluationReport): string {
  const best = findBestSummary(report.summaries);
  const worst = findWorstSummary(report.summaries);
  const spread =
    best !== null && worst !== null ? `${(Math.abs(best.accuracy - worst.accuracy) * 100).toFixed(2)} percentage points` : "n/a";

  const highlights: string[] = [];
  if (best !== null) {
    highlights.push(`Best accuracy: \`${best.middleware}\` at **${toPct(best.accuracy)}** (${best.correct}/${best.evaluatedRows}).`);
  }
  if (worst !== null && worst.middleware !== best?.middleware) {
    highlights.push(`Lowest accuracy: \`${worst.middleware}\` at **${toPct(worst.accuracy)}** (${worst.correct}/${worst.evaluatedRows}).`);
  }
  if (best !== null && worst !== null && best.middleware !== worst.middleware) {
    highlights.push(`Gap between best and worst middleware: **${spread}**.`);
  }

  const routingFacts = report.summaries.map((summary) => `- ${describeRouting(summary)}`);
  const thinkingFacts = report.summaries.map(
    (summary) =>
      `- \`${summary.middleware}\` returned explicit thinking traces on ${summary.rowsWithThinking}/${summary.evaluatedRows} rows.`,
  );
  const invalidFact = report.summaries
    .filter((summary) => summary.invalidPredictions > 0)
    .map((summary) => `- \`${summary.middleware}\` produced ${summary.invalidPredictions} non-parseable answers.`);

  const lines: string[] = [
    "# Router Evaluation Summary",
    "",
    "## Overview",
    "",
    `- Generated at: \`${report.generatedAt}\``,
    `- Dataset: \`${report.dataset}\``,
    `- Endpoint: \`${report.endpoint}\``,
    `- Rows evaluated: **${report.rowsEvaluated}**`,
    `- Middleware compared: ${report.summaries.map((summary) => `\`${summary.middleware}\``).join(", ")}`,
    "",
    "## Most Interesting Facts",
    "",
    ...(highlights.length > 0 ? highlights.map((line) => `- ${line}`) : ["- No middleware summaries were produced."]),
    ...routingFacts,
    ...thinkingFacts,
    ...(invalidFact.length > 0 ? invalidFact : ["- All returned answers were parseable as one of `A`, `B`, `C`, or `D`."]),
    "",
    "## Scoreboard",
    "",
    "| Middleware | Accuracy | Correct | Invalid Picks | Routed Models | Small-Routed | Large-Routed |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.summaries.map((summary) => {
      const smallRouted = summary.byRoutedSize.small?.total ?? 0;
      const largeRouted = summary.byRoutedSize.large?.total ?? 0;
      return `| \`${summary.middleware}\` | ${toPct(summary.accuracy)} | ${summary.correct}/${summary.evaluatedRows} | ${summary.invalidPredictions} | ${Object.keys(summary.byRoutedModel).length} | ${smallRouted} | ${largeRouted} |`;
    }),
    "",
    "## Per-Middleware Notes",
    "",
  ];

  for (const summary of report.summaries) {
    lines.push(`### ${summary.middleware}`);
    lines.push("");
    lines.push(`- Accuracy: **${toPct(summary.accuracy)}** (${summary.correct}/${summary.evaluatedRows})`);
    lines.push(`- Routed models seen: ${Object.keys(summary.byRoutedModel).length}`);
    lines.push(`- Token usage reported by endpoint: prompt=${summary.totalPromptTokens}, completion=${summary.totalCompletionTokens}, total=${summary.totalTokens}`);
    lines.push(`- Rows with explicit thinking traces: ${summary.rowsWithThinking}/${summary.evaluatedRows}`);
    if (summary.tokenSplitRows > 0) {
      lines.push(
        `- Known token split from provider metadata: answer=${summary.totalAnswerTokensKnown}, reasoning=${summary.totalReasoningTokensKnown} across ${summary.tokenSplitRows} rows`,
      );
    } else {
      lines.push(`- Provider did not expose separate reasoning token counts in the response usage metadata.`);
    }

    const routedModelEntries = Object.entries(summary.byRoutedModel).sort((a, b) => b[1].total - a[1].total);
    if (routedModelEntries.length > 0) {
      lines.push(`- Routed model breakdown:`);
      for (const [model, bucket] of routedModelEntries) {
        lines.push(`  - \`${model}\`: ${bucket.total} prompts, ${bucket.correct} correct, ${toPct(bucket.correct / bucket.total)} accuracy`);
      }
    }

    if (summary.sampleErrors.length > 0) {
      lines.push(`- Example misses:`);
      for (const error of summary.sampleErrors.slice(0, 5)) {
        lines.push(`  - #${error.index}: expected \`${error.expected}\`, got \`${error.got ?? "?"}\`, routed to \`${error.routedModel}\``);
      }
    } else {
      lines.push(`- No misses in the sampled rows.`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allRows = await loadDataset(args.dataset);
  const rows = args.limit === null ? allRows : allRows.slice(0, args.limit);

  console.log(`Dataset:    ${args.dataset}`);
  console.log(`Rows:       ${rows.length}/${allRows.length}`);
  console.log(`Endpoint:   ${args.endpoint}`);
  console.log(`Middleware: ${args.middlewares.join(", ")}`);
  console.log(`Concurrency:${args.concurrency}`);
  console.log(`Timeout ms: ${args.timeoutMs}`);
  console.log(`Max tokens: ${args.maxCompletionTokens}`);
  console.log(`Max retries:${args.maxRetries}`);
  console.log(`Retry delay:${args.retryDelayMs}`);

  const summaries: EvaluationSummary[] = [];

  for (const middleware of args.middlewares) {
    const { summary } = await evaluateMiddleware(
      rows,
      middleware,
      args.endpoint,
      args.concurrency,
      args.timeoutMs,
      args.maxCompletionTokens,
      args.maxRetries,
      args.retryDelayMs,
    );
    summary.datasetPath = args.dataset;
    summary.datasetRows = allRows.length;
    printSummary(summary, args.verboseErrors);
    summaries.push(summary);
  }

  const report: EvaluationReport = {
    generatedAt: new Date().toISOString(),
    endpoint: args.endpoint,
    dataset: args.dataset,
    rowsEvaluated: rows.length,
    summaries,
  };

  console.log(`\nJSON summary:`);
  console.log(JSON.stringify(report, null, 2));

  if (args.outputPath) {
    await Bun.write(
      args.outputPath,
      JSON.stringify(report, null, 2),
    );
    console.log(`\nWrote JSON summary to ${args.outputPath}`);
  }

  if (args.markdownPath) {
    await Bun.write(args.markdownPath, renderMarkdownReport(report));
    console.log(`Wrote Markdown summary to ${args.markdownPath}`);
  }
}

await main();
import { isAbsolute, resolve } from "node:path";
