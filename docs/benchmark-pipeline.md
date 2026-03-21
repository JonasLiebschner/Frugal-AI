# Benchmark Pipeline

## Reproducibility

Based on the pulled RouterBench release, about `93.9%` of rows and prompt IDs come from exact-answer tasks that can be reproduced without an LLM judge:

- `hellaswag`
- `grade-school-math` (`gsm8k`)
- `arc-challenge`
- `winogrande`
- `mmlu-*`

The remaining open-ended tasks such as summary, RAG, and judge-based benchmarks are not fully reproducible from the public result tables alone because the released CSVs do not include the gold outputs or the original judge traces.

## What This Pipeline Does

This package creates a clean exact-match benchmark flow for new models served through Ollama:

1. Build a reproducible manifest from upstream benchmark datasets.
2. Discover models from an Ollama server.
3. Run prompts against one or more installed models.
4. Parse answers and score correctness.
5. Write prediction logs and summary CSVs.

By default, benchmark runs now add a strict system instruction that requires a single final line in one of these forms:

- `FINAL_ANSWER: <A|B|C|D>`
- `FINAL_ANSWER: <1|2>`
- `FINAL_ANSWER: <number>`

The parser extracts `FINAL_ANSWER:` first. If no marker is present in the visible response, it falls back to the older regex-based extraction rules. For providers that expose a separate `thinking` field, the parser will only use that fallback text when it also contains an explicit `FINAL_ANSWER:` marker.

## Install

```powershell
pip install -e .[bench]
```

## List Models

```powershell
frugal-bench list-models --base-url http://172.26.32.29:11434
```

## Build a Manifest

```powershell
frugal-bench build-manifest `
  --tasks hellaswag arc_challenge winogrande gsm8k mmlu:professional_law `
  --samples-per-task 20 `
  --shots 5 `
  --seed 42 `
  --out manifests/routerbench_exact_100.jsonl
```

## Run the Benchmark

```powershell
frugal-bench run `
  --manifest manifests/routerbench_exact_100.jsonl `
  --base-url http://172.26.32.29:11434 `
  --models installed `
  --out-dir runs/routerbench_exact_100 `
  --pricing-file configs/model_pricing.example.json `
  --temperature 0 `
  --num-predict 256 `
  --max-workers 1
```

## Outputs

The runner writes:

- `predictions.jsonl`
- `predictions.csv`
- `summary_by_model.csv`
- `summary_by_task.csv`
- `summary_by_model_task.csv`
- `run_metadata.json`

## Hosted-Equivalent Cost Proxy

The runner supports an optional pricing file that estimates a hosted-equivalent token cost for each Ollama response:

`estimated_cost_usd = prompt_eval_count * input_price_per_million_usd / 1_000_000 + eval_count * output_price_per_million_usd / 1_000_000`

This is a proxy only:

- token counts come from Ollama telemetry,
- pricing comes from an external hosted pricing source,
- the result is not a true local infrastructure bill.

The example pricing file is:

- `configs/model_pricing.example.json`

Per-prediction outputs include:

- `pricing_model_name`
- `pricing_source_url`
- `input_price_per_million_usd`
- `output_price_per_million_usd`
- `estimated_cost_usd`

Summary CSVs also include:

- `avg_estimated_cost_usd`
- `total_estimated_cost_usd`

## Current Scope

This first version intentionally targets the reproducible exact-match subset only. That gives you a fair and owned pipeline for latest Ollama models without depending on proprietary judge models.
