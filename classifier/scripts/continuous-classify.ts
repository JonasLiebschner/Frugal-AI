/**
 * continuous-classify.ts
 *
 * Runs in a loop, picking a random middleware and a random question every
 * N seconds, firing a completion call and printing the result.
 *
 * Usage:
 *   bun run scripts/continuous-classify.ts [options]
 *
 * Options:
 *   --endpoint <url>      LLM proxy /v1/chat/completions URL (default: https://llmproxy.frugalai.haupt.dev/v1/chat/completions)
 *   --middleware <name>   Middleware to include (repeatable; default: all four)
 *   --interval <n>        Seconds between requests (default: 5)
 *   --timeout-ms <n>      Per-request timeout in ms (default: 60000)
 *   --help
 */

const DEFAULT_ENDPOINT =
  "https://llmproxy.frugalai.haupt.dev/v1/chat/completions";
const MAX_COMPLETION_TOKENS = 10000;

const DEFAULT_MIDDLEWARES = [
  "middleware:simple",
  "middleware:onnx",
  "middleware:llm",
  // "middleware:vs",
  // "middleware:svc",
];

const QUESTIONS = [
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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function usage() {
  console.log(`Usage:
  bun run scripts/continuous-classify.ts [options]

Options:
  --endpoint <url>      LLM proxy completions endpoint (default: ${DEFAULT_ENDPOINT})
  --middleware <name>   Middleware to include (repeatable; default: all four)
  --interval <n>        Seconds between requests (default: 5)
  --timeout-ms <n>      Per-request timeout in milliseconds (default: 60000)
  --help                Show this message

Available middlewares:
  middleware:simple     Heuristic classifier
  middleware:onnx       ModernBERT ONNX classifier
  middleware:llm        LLM-based classifier
  middleware:svc        SVC (vector search) classifier

Examples:
  bun run scripts/continuous-classify.ts
  bun run scripts/continuous-classify.ts --interval 10 --middleware middleware:simple --middleware middleware:llm
  bun run scripts/continuous-classify.ts --endpoint http://localhost:4000/v1/chat/completions --interval 2
`);
}

function parseArgs(argv: string[]) {
  const middlewares: string[] = [];
  let endpoint = DEFAULT_ENDPOINT;
  let interval = 5;
  let timeoutMs = 60000;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help") {
      usage();
      process.exit(0);
    }
    if (arg === "--endpoint") {
      endpoint = argv[++i]!;
      continue;
    }
    if (arg === "--middleware") {
      middlewares.push(argv[++i]!);
      continue;
    }
    if (arg === "--interval") {
      interval = parseFloat(argv[++i]!);
      continue;
    }
    if (arg === "--timeout-ms") {
      timeoutMs = parseInt(argv[++i]!, 10);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (interval <= 0) throw new Error(`--interval must be > 0`);

  return {
    endpoint,
    middlewares: middlewares.length > 0 ? middlewares : DEFAULT_MIDDLEWARES,
    interval,
    timeoutMs,
  };
}

let requestCount = 0;

async function runOne(
  endpoint: string,
  middleware: string,
  question: string,
  timeoutMs: number,
) {
  const n = ++requestCount;
  const ts = new Date().toISOString().slice(11, 19); // HH:MM:SS
  console.log(`\n[${ts}] #${n} ${middleware}`);
  console.log(`  Q: ${question}`);

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
      console.log(
        `  ✗ HTTP ${res.status} (${durationMs}ms): ${body.slice(0, 120)}`,
      );
      return;
    }

    const data = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const routedModel = data.model ?? "unknown";
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    const preview = content.slice(0, 100).replace(/\n/g, " ");
    const tokens = data.usage?.total_tokens ?? null;

    console.log(
      `  → ${routedModel} | ${durationMs}ms${tokens !== null ? ` | ${tokens} tokens` : ""}`,
    );
    console.log(`  A: ${preview}${content.length > 100 ? "…" : ""}`);
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ${message} (${durationMs}ms)`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`Endpoint:    ${args.endpoint}`);
  console.log(`Middlewares: ${args.middlewares.join(", ")}`);
  console.log(`Interval:    ${args.interval}s`);
  console.log(`Max tokens:  ${MAX_COMPLETION_TOKENS}`);
  console.log(`Timeout:     ${args.timeoutMs}ms`);
  console.log(`\nRunning… (Ctrl+C to stop)`);

  const intervalMs = args.interval * 1000;

  // Fire the first request immediately, then repeat every interval.
  while (true) {
    const middleware = pick(args.middlewares);
    const question = pick(QUESTIONS);
    await runOne(args.endpoint, middleware, question, args.timeoutMs);
    await Bun.sleep(intervalMs);
  }
}

await main();
