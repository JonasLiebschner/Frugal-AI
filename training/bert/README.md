# LLM Router — Training

Binary classifier that routes user queries to either a `small` or `large` LLM, based on query complexity. Fine-tunes [ModernBERT-base](https://huggingface.co/answerdotai/ModernBERT-base) and exports to ONNX int8 for fast CPU inference (~10ms p50).

## Labels

| Label | Value | Meaning |
|-------|-------|---------|
| `small` | 0 | Query can be handled by a small/cheap model |
| `large` | 1 | Query requires a large/capable model |

## Training Data

Two datasets are merged and undersampled to a 50/50 class balance:

| Dataset | Split | Rows | Source |
|---------|-------|------|--------|
| [`DevQuasar/llm_router_dataset-synth`](https://huggingface.co/datasets/DevQuasar/llm_router_dataset-synth) | train | ~5K | Synthetic routing queries |
| [`routellm/gpt4_dataset`](https://huggingface.co/datasets/routellm/gpt4_dataset) | train | ~109K | Real Chatbot Arena queries |

**Label mapping for `routellm/gpt4_dataset`:** `mixtral_score >= 4 → small (0)`, `mixtral_score <= 3 → large (1)`

After merging and balancing: **47,376 rows (23,688 per class)**.

Build the augmented dataset once before training:

```bash
uv run python main.py augment
# saves to data/v2_augmented/ + data/v2_augmented/metadata.json
```

## Versioning

```
data/
  v2_augmented/        <- merged + balanced training set

model/
  v2/                  <- trained on 47,376 rows, MAX_SEQ_LENGTH=128
  v3/                  <- trained on 23,688 rows, MAX_SEQ_LENGTH=256
```

Each model directory contains the HuggingFace checkpoint, `model.onnx`, and `model_int8.onnx`.
The active version is set via `MODEL_VERSION` in `classifier/config.py`.

## Setup

```bash
uv sync
```

Requires Python 3.13+. Uses `uv` for dependency management.

## Workflow

```bash
# 1. Build augmented dataset (one-time)
uv run python main.py augment

# 2. Train
uv run python main.py train

# 3. Export to ONNX + int8 quantization
uv run python main.py export-onnx

# 4. Benchmark on test splits
uv run python benchmark_onnx.py                  # all splits
uv run python benchmark_onnx.py --split synth    # DevQuasar test split only
uv run python benchmark_onnx.py --split routellm # routellm validation split only

# 5. Interactive inference
uv run python infer_onnx.py
```

To prevent macOS from sleeping during training:

```bash
caffeinate uv run python main.py train
```

## Configuration

All hyperparameters and paths are in `classifier/config.py`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MODEL_VERSION` | `"v3"` | Output directory under `model/` |
| `MAX_SEQ_LENGTH` | `256` | Token truncation length |
| `TRAIN_BATCH_SIZE` | `4` | Per-device train batch size |
| `EVAL_BATCH_SIZE` | `16` | Per-device eval batch size |
| `MAX_TRAIN_SAMPLES` | `23_688` | Cap on training rows (`None` = full dataset) |
| `NUM_EPOCHS` | `3` | Training epochs |
| `LEARNING_RATE` | `2e-5` | AdamW learning rate |
| `WEIGHT_DECAY` | `0.01` | AdamW weight decay |
| `WARMUP_RATIO` | `0.1` | Linear warmup fraction |

## Inference Server

The trained model is served via FastAPI using ONNX int8 for low-latency CPU inference:

```bash
uv run python main.py serve
# listening on http://0.0.0.0:8000
```

```bash
curl -X POST http://localhost:8000/api/v1/classify \
  -H "Content-Type: application/json" \
  -d '{"query": "Can you implement a JavaScript framework for ML model training?"}'
# {"result": "large"}
```

## Benchmark Results (v2, MAX_SEQ_LENGTH=128)

Evaluated on `DevQuasar/llm_router_dataset-synth` test split:

| Metric | Value |
|--------|-------|
| Accuracy | 95.49% |
| F1 (binary) | 95.74% |
| Avg latency | 9.65ms |
| p95 latency | 15.08ms |

## Project Structure

```
main.py               - CLI entrypoint (train / augment / export-onnx / serve)
train.py              - Fine-tuning with HuggingFace Trainer
augment_dataset.py    - Dataset merging, balancing, and saving
export_onnx.py        - ONNX export + int8 dynamic quantization
benchmark_onnx.py     - Accuracy/F1/latency evaluation on test splits
infer_onnx.py         - Interactive REPL for manual testing
serve.py              - FastAPI inference server
classifier/
  config.py           - All hyperparameters and paths
  predictor.py        - ONNX inference wrapper (used by serve.py)
```
