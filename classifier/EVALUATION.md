# Evaluation Scripts

This folder contains the scripts we use to evaluate direct models, middleware routing, and the derived "energy proxy" metrics.

The default endpoint used by the scripts is:

`https://llmproxy.frugalai.haupt.dev/v1/chat/completions`

The diagnostics endpoint is used internally to backfill token and timing metrics from the proxy request ID returned in the response headers.

## Dataset Format

The benchmark CSVs live in [`../evaluation_data`](../evaluation_data).

Current high-scattered benchmark:

- [`../evaluation_data/evaluation_dataset_highScattered.csv`](../evaluation_data/evaluation_dataset_highScattered.csv)

Expected columns:

- `prompt`: the full prompt sent to the model
- `true_label`: expected answer letter, usually `A`, `B`, `C`, or `D`
- `scattering`: numeric difficulty / spread signal
- `mmlu_subject`: optional source subject label

Important detail:

- the `prompt` field is usually a long, already formatted multiple-choice prompt
- many rows contain several in-context examples before the final question
- the evaluator expects the model to answer with a single letter

Example header:

```csv
prompt,true_label,scattering,mmlu_subject
```

## Scripts

### 1. Quick Middleware Evaluator

File:

- [`scripts/router-eval.ts`](scripts/router-eval.ts)

Use this when you want a simple score run for one or more middleware models.

What it does:

- reads the CSV
- sends each row to a middleware model such as `middleware:simple`
- extracts the final answer from `message.content`
- scores accuracy against `true_label`
- records the routed backend model from the response
- writes JSON and Markdown summaries

Typical use:

```bash
cd classifier
bun run eval:router \
  --middleware middleware:simple \
  --limit 50 \
  --output ../tmp/simple_50.json
```

Good for:

- sanity checks
- trying a single middleware first
- verifying the endpoint behavior before a larger run

### 2. Direct Baseline + Middleware Comparison

File:

- [`scripts/baseline-middleware-compare.ts`](scripts/baseline-middleware-compare.ts)

This is the main comparison script.

What it does:

- runs the dataset against two direct baseline models
- by default:
  - small: `gpt-oss-120b-working`
  - large: `minimax-m2.5-229b`
- probes each middleware model:
  - `middleware:simple`
  - `middleware:onnx`
  - `middleware:llm`
- for middleware rows, it only uses the middleware call to determine which backend model was selected
- the scored answer for middleware is then taken from the cached direct baseline result of that selected backend
- stores diagnostics-backed metrics when available:
  - proxy request ID
  - completion tokens
  - reasoning tokens
  - answer tokens
  - timing information

This design is intentional:

- middleware calls can be kept very short
- middleware scoring reflects the selected backend model's answer
- we avoid grading a truncated middleware response when we only care about routing quality

Failure handling:

- if a response ends because of token limit and no final answer is present, it is recorded as a failed row
- token and timing data are still kept if diagnostics are available
- unknown errors still stop the run

Caching:

- results are cached in `tmp/highscattered_first30_result_cache.json`
- cache keys include model, prompt hash, endpoint, token settings, and mode
- reruns reuse finished rows instead of repeating them

Typical use:

```bash
cd classifier
bun run eval:compare \
  --dataset ../evaluation_data/evaluation_dataset_highScattered.csv \
  --limit 30 \
  --output-dir ../tmp \
  --small-model gpt-oss-120b-working \
  --large-model minimax-m2.5-229b \
  --baseline-max-tokens 10000 \
  --middleware-initial-tokens 32 \
  --middleware-max-tokens 32
```

Useful flags:

- `--dataset <path>`
- `--limit <n>`
- `--output-dir <path>`
- `--small-model <name>`
- `--large-model <name>`
- `--baseline-max-tokens <n>`
- `--middleware-initial-tokens <n>`
- `--middleware-max-tokens <n>`
- `--timeout-ms <n>`
- `--max-retries <n>`
- `--retry-delay-ms <n>`

Outputs:

- direct baseline CSV
- combined per-row CSV
- JSON summary
- Markdown summary
- cache JSON

### 3. Energy Proxy Report

File:

- [`scripts/energy-proxy-report.ts`](scripts/energy-proxy-report.ts)

This script turns the comparison outputs into a configurable "energy proxy" view.

Current formula:

```text
load_units = total_tokens * tokenUnitWeight + duration_ms * durationMsUnitWeight
proxy_energy = load_units * model_factor(selected_model) * middleware_multiplier(entity)
```

What it does:

- reads the comparison JSON
- reads the combined CSV
- applies configurable per-model and per-middleware weighting
- produces:
  - row-level energy CSV
  - summary JSON
  - Markdown energy report
  - Markdown middleware summary

Typical use:

```bash
cd classifier
bun run eval:energy \
  --comparison-json ../tmp/highscattered_first30_comparison.json \
  --combined-csv ../tmp/highscattered_first30_all_results.csv \
  --output-dir ../tmp
```

Default weights currently used:

- model factors:
  - `gpt-oss-120b-working` = `1`
  - `minimax-m2.5-229b` = `3`
- middleware multipliers:
  - `direct` = `1`
  - `middleware:simple` = `1`
  - `middleware:onnx` = `1.2`
  - `middleware:llm` = `1.1`

These are heuristics, not measured power values.

## Common Workflows

### Quick sanity check on one middleware

```bash
cd classifier
bun run eval:router \
  --middleware middleware:simple \
  --limit 50 \
  --output ../tmp/router_simple_50.json
```

### Full direct-vs-middleware comparison on first 30 rows

```bash
cd classifier
bun run eval:compare \
  --dataset ../evaluation_data/evaluation_dataset_highScattered.csv \
  --limit 30 \
  --output-dir ../tmp
```

### Regenerate energy and middleware reports from existing comparison files

```bash
cd classifier
bun run eval:energy --output-dir ../tmp
```

## Outputs

The current scripts write into [`../tmp`](../tmp).

Common output files:

- `highscattered_first30_direct_baseline.csv`
- `highscattered_first30_all_results.csv`
- `highscattered_first30_comparison.json`
- `highscattered_first30_comparison.md`
- `highscattered_first30_result_cache.json`
- `highscattered_first30_energy_proxy_config.json`
- `highscattered_first30_energy_proxy_rows.csv`
- `highscattered_first30_energy_proxy_summary.json`
- `highscattered_first30_energy_proxy_report.md`
- `highscattered_first30_middleware_summary.md`

Note:

- some filenames are still hardcoded for the current `highscattered_first30` workflow even if you change `--limit`
- the data inside the files still reflects the actual run arguments

## Metrics We Store

Per row, depending on the script and provider diagnostics, we may store:

- `answer`
- `correct`
- `truncated`
- `routedModel`
- `proxyRequestId`
- `completionTokens`
- `reasoningTokens`
- `answerTokens`
- `totalTokens`
- `durationMs`
- `providerLatencyMs`
- `queuedMs`
- `generationMs`
- `timeToFirstTokenMs`

Important token note:

- the raw completion endpoint does not currently return `usage`
- token metrics come from the diagnostics endpoint
- `completionTokens` is treated as total generated output tokens
- prompt token counts are currently not exposed by the diagnostics payload we are using

## When To Use Which Script

- use `router-eval.ts` when you want a fast middleware-only score check
- use `baseline-middleware-compare.ts` when you want the real comparison workflow
- use `energy-proxy-report.ts` when you already have comparison outputs and want cost / energy-style reporting
