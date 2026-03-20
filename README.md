# Frugal-AI

The project can be run using docker compose.

## Architecture
The project consists of a router and a end-user dashboard.

### Router
TBD
Any request to a LLM is stored in a database using OpenTelemetry standards (e.g. Tempo).

### Dashboard
The dashboard is structured into backend and frontend.
The backend consumes traces based on the [OTEL standard](https://opentelemetry.io/docs/specs/semconv/gen-ai/) and transforms them for the frontend.

The frontend consumes the previously hold conversations and shows their consumption and metadata.
Additionally a chat window is available, which calls the router for inference.

## Evaluation CSV datasets (`evaluation_data/`)

The files **`evaluation_dataset_full.csv`** and **`evaluation_dataset_highScattered.csv`** are derived from the **[RouterBench](https://arxiv.org/abs/2403.12031)** benchmark (see also [withmartian/routerbench](https://github.com/withmartian/routerbench)). The upstream table is the long-format release loaded from **`evaluation_data/routerbench_raw.pkl`**: one row per **prompt × model**, with fields such as `prompt`, `eval_name`, `model_response`, `performance`, and `model_name`.

### Shared construction (both CSVs)

1. **Multiple-choice scope** — Keep rows whose `eval_name` is either any **`mmlu-*`** subject or one of **`hellaswag`**, **`arc-challenge`**, **`winogrande`**, **`accounting_audit`**.
2. **Prompt grain** — Collapse to one row per **`sample_id`** (one prompt instance).
3. **Eligibility** — Keep only prompts where **at least one** model has **performance = 1** (numeric 1.0 after parsing). Prompts where no model scores 1 are dropped.
4. **`true_label`** — Among models with performance 1, take **`model_response`** from the model with the **lexicographically first `model_name`** (deterministic tie-break).
5. **`scattering`** — For that prompt, `scattering =` (number of **distinct** `model_response` strings across all models) **÷** (number of models, 11 in this pickle). Same string ⇒ same bucket; no text normalization.
6. **`mmlu_subject`** — For MMLU rows, the Hugging Face–style MMLU **config** name: the `eval_name` suffix after `mmlu-` with hyphens replaced by underscores (e.g. `mmlu-high-school-biology` → `high_school_biology`). For non-MMLU benchmarks this column is **empty**.

### `evaluation_dataset_full.csv`

All MCQ prompts that pass the rules above (no per-category cap).

### `evaluation_dataset_highScattered.csv`

Same base population as the full file, then **keep only the 15 prompts with the highest `scattering` in each category**:

- **MMLU** — Group by **`mmlu_subject`**; keep **15** rows per subject (ties broken by stable sort order).
- **Non-MMLU** — Group by **`eval_name`** (`hellaswag`, `arc-challenge`, `winogrande`, `accounting_audit`); keep **15** rows per benchmark.

To reproduce or adjust these exports, run logic against **`routerbench_raw.pkl`** with the steps above (the CSVs alone do not store `eval_name`; non-MMLU grouping uses the pickle).
