/**
 * random-classify.ts
 *
 * Fires chat completion calls with randomly selected questions against the LLM
 * proxy, using each classifier middleware as the router. Useful for quick
 * smoke-testing all middlewares without needing a dataset file.
 *
 * Usage:
 *   bun run scripts/random-classify.ts [options]
 *
 * Options:
 *   --endpoint <url>      LLM proxy /v1/chat/completions URL (default: https://llmproxy.frugalai.haupt.dev/v1/chat/completions)
 *   --middleware <name>   Middleware to use (repeatable; default: all four)
 *   --count <n>           Number of questions to sample (default: 10)
 *   --concurrency <n>     Parallel requests per middleware (default: 3)
 *   --timeout-ms <n>      Per-request timeout in ms (default: 60000)
 *   --seed <n>            Random seed for reproducibility (default: random)
 *   --help
 */

const DEFAULT_ENDPOINT = "https://llmproxy.frugalai.haupt.dev/v1/chat/completions";
const MAX_COMPLETION_TOKENS = 10000;

const DEFAULT_MIDDLEWARES = [
  "middleware:simple",
  "middleware:onnx",
  "middleware:llm",
  "middleware:svc",
];

// A diverse set of questions spanning simple and complex complexity levels.
const QUESTIONS = [
  // --- Simple ---
  "What is the capital of France?",
  "How many days are in a leap year?",
  "What does HTTP stand for?",
  "What is 17 multiplied by 6?",
  "Who wrote Romeo and Juliet?",
  "What is the boiling point of water in Celsius?",
  "How many continents are there?",
  "What is the chemical symbol for gold?",
  "What year did World War II end?",
  "How many bytes are in a kilobyte?",
  "What is the speed of light in a vacuum (approximately)?",
  "What programming language was created by Guido van Rossum?",
  "What is the square root of 144?",
  "What does DNS stand for?",
  "What is the largest planet in our solar system?",
  // --- Complex ---
  "Explain the difference between supervised and unsupervised machine learning, and give two examples of each.",
  "How does the transformer architecture in neural networks work, and why did it replace recurrent models for NLP tasks?",
  "Compare and contrast microservices and monolithic architectures. When would you choose each?",
  "Explain how garbage collection works in the JVM, including the difference between minor and major GC cycles.",
  "What are the SOLID principles in software design? Provide a brief explanation and example for each.",
  "Describe the CAP theorem and its implications for distributed database design.",
  "How does HTTPS ensure secure communication? Walk through the TLS handshake step by step.",
  "What is the difference between eventual consistency and strong consistency in distributed systems?",
  "Explain how React's virtual DOM works and why diffing improves rendering performance.",
  "What are the trade-offs between using a relational database versus a document database for a social media application?",
  "How does Kubernetes handle pod scheduling, and what factors influence where a pod is placed?",
  "Explain the concept of backpressure in streaming systems and how it prevents memory exhaustion.",
  "What is the difference between OAuth 2.0 and OpenID Connect, and when would you use each?",
  "Describe how a B-tree index works in a relational database and why it's preferred over other index structures.",
  "Explain the differences between TCP and UDP and give real-world examples where each is the better choice.",
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function sampleQuestions(count: number, seed: number): string[] {
  const rng = seededRandom(seed);
  const pool = [...QUESTIONS];
  const result: string[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * (pool.length - i));
    result.push(pool[idx]!);
    pool[idx] = pool[pool.length - 1 - i]!;
  }
  return result;
}

function usage() {
  console.log(`Usage:
  bun run scripts/random-classify.ts [options]

Options:
  --endpoint <url>      LLM proxy completions endpoint (default: ${DEFAULT_ENDPOINT})
  --middleware <name>   Middleware to test (repeatable; default: all four)
  --count <n>           Number of random questions to sample (default: 10)
  --concurrency <n>     Parallel requests per middleware (default: 3)
  --timeout-ms <n>      Per-request timeout in milliseconds (default: 60000)
  --seed <n>            Random seed for reproducibility
  --help                Show this message

Available middlewares:
  middleware:simple     Heuristic classifier
  middleware:onnx       ModernBERT ONNX classifier
  middleware:llm        LLM-based classifier
  middleware:svc        SVC (vector search) classifier

Examples:
  bun run scripts/random-classify.ts
  bun run scripts/random-classify.ts --count 5 --middleware middleware:simple --middleware middleware:llm
  bun run scripts/random-classify.ts --endpoint http://localhost:4000/v1/chat/completions --seed 42
`);
}

function parseArgs(argv: string[]) {
  const middlewares: string[] = [];
  let endpoint = DEFAULT_ENDPOINT;
  let count = 10;
  let concurrency = 3;
  let timeoutMs = 60000;
  let seed = Math.floor(Math.random() * 0xffffffff);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help") { usage(); process.exit(0); }
    if (arg === "--endpoint") { endpoint = argv[++i]!; continue; }
    if (arg === "--middleware") { middlewares.push(argv[++i]!); continue; }
    if (arg === "--count") { count = parseInt(argv[++i]!, 10); continue; }
    if (arg === "--concurrency") { concurrency = parseInt(argv[++i]!, 10); continue; }
    if (arg === "--timeout-ms") { timeoutMs = parseInt(argv[++i]!, 10); continue; }
    if (arg === "--seed") { seed = parseInt(argv[++i]!, 10); continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    endpoint,
    middlewares: middlewares.length > 0 ? middlewares : DEFAULT_MIDDLEWARES,
    count,
    concurrency,
    timeoutMs,
    seed,
  };
}

interface CompletionResult {
  question: string;
  routedModel: string | null;
  response: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
  error: string | null;
}

async function runOne(
  endpoint: string,
  middleware: string,
  question: string,
  timeoutMs: number,
): Promise<CompletionResult> {
  const start = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: middleware,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        messages: [{ role: "user", content: question }],
      }),
    });

    const durationMs = Date.now() - start;

    if (!res.ok) {
      const body = await res.text();
      return { question, routedModel: null, response: null, promptTokens: null, completionTokens: null, durationMs, error: `HTTP ${res.status}: ${body}` };
    }

    const data = await res.json() as {
      model?: string;
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      question,
      routedModel: data.model ?? null,
      response: data.choices?.[0]?.message?.content?.trim() ?? null,
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
      durationMs,
      error: null,
    };
  } catch (err) {
    return {
      question,
      routedModel: null,
      response: null,
      promptTokens: null,
      completionTokens: null,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runMiddleware(
  endpoint: string,
  middleware: string,
  questions: string[],
  concurrency: number,
  timeoutMs: number,
): Promise<CompletionResult[]> {
  const results: CompletionResult[] = [];
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= questions.length) return;
      const question = questions[idx]!;
      const result = await runOne(endpoint, middleware, question, timeoutMs);
      results.push(result);

      const preview = (result.response ?? "").slice(0, 80).replace(/\n/g, " ");
      const status = result.error ? `ERROR: ${result.error}` : `→ ${result.routedModel ?? "?"} | ${result.durationMs}ms | "${preview}${(result.response?.length ?? 0) > 80 ? "…" : ""}"`;
      console.log(`  [${idx + 1}/${questions.length}] ${status}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, questions.length) }, () => worker()));
  return results;
}

function printSummary(middleware: string, results: CompletionResult[]) {
  const ok = results.filter((r) => r.error === null);
  const failed = results.filter((r) => r.error !== null);
  const totalPrompt = ok.reduce((s, r) => s + (r.promptTokens ?? 0), 0);
  const totalCompletion = ok.reduce((s, r) => s + (r.completionTokens ?? 0), 0);
  const avgDuration = ok.length > 0 ? Math.round(ok.reduce((s, r) => s + r.durationMs, 0) / ok.length) : 0;

  const routedModels: Record<string, number> = {};
  for (const r of ok) {
    if (r.routedModel) {
      routedModels[r.routedModel] = (routedModels[r.routedModel] ?? 0) + 1;
    }
  }

  console.log(`\n── ${middleware} ──`);
  console.log(`  Completed: ${ok.length}/${results.length}${failed.length > 0 ? ` (${failed.length} errors)` : ""}`);
  console.log(`  Avg latency: ${avgDuration}ms`);
  console.log(`  Tokens: prompt=${totalPrompt} completion=${totalCompletion} total=${totalPrompt + totalCompletion}`);
  if (Object.keys(routedModels).length > 0) {
    console.log(`  Routed models:`);
    for (const [model, count] of Object.entries(routedModels).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${model}: ${count} request(s)`);
    }
  }
  if (failed.length > 0) {
    console.log(`  Errors:`);
    for (const r of failed) {
      console.log(`    "${r.question.slice(0, 60)}…" → ${r.error}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const questions = sampleQuestions(args.count, args.seed);

  console.log(`Endpoint:    ${args.endpoint}`);
  console.log(`Middlewares: ${args.middlewares.join(", ")}`);
  console.log(`Questions:   ${questions.length} (seed=${args.seed})`);
  console.log(`Concurrency: ${args.concurrency}`);
  console.log(`Max tokens:  ${MAX_COMPLETION_TOKENS}`);
  console.log(`Timeout:     ${args.timeoutMs}ms`);
  console.log();

  for (const middleware of args.middlewares) {
    console.log(`\n▶ ${middleware}`);
    const results = await runMiddleware(args.endpoint, middleware, questions, args.concurrency, args.timeoutMs);
    printSummary(middleware, results);
  }

  console.log("\nDone.");
}

await main();
