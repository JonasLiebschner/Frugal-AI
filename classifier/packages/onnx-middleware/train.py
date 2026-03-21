"""
Train a DistilBERT sequence classifier on the llm_router_dataset-synth dataset
and export it to ONNX (float32 + int8 quantized).

Usage:
    uv run --with torch --with transformers --with datasets --with optimum[onnxruntime] --with scikit-learn train.py

Output (written to ./model_output/):
    tokenizer.json + tokenizer_config.json  — tokenizer files for TypeScript
    model.onnx                              — float32 ONNX model
    model_int8.onnx                         — int8 quantized ONNX model
"""

import json
import time
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BASE_MODEL = "distilbert-base-uncased"
MAX_SEQ_LEN = 128
BATCH_SIZE = 32
EPOCHS = 3
LR = 2e-5
TEST_SPLIT = 0.1
SEED = 42

DATASET_PATH = (
    Path(__file__).parent.parent / "simple-middleware" / "data" / "llm_router_dataset.json"
)
OUTPUT_DIR = Path(__file__).parent / "model_output"

LABEL2ID = {"small": 0, "large": 1}
ID2LABEL = {0: "small", 1: "large"}

# ---------------------------------------------------------------------------
# Load dataset
# ---------------------------------------------------------------------------

print(f"Loading dataset from {DATASET_PATH} ...")
with open(DATASET_PATH) as f:
    rows = json.load(f)

texts = [r["prompt"] for r in rows]
labels = [r["label"] for r in rows]  # 0 = small, 1 = large

print(f"  {len(texts)} examples  |  large: {sum(labels)}  small: {len(labels) - sum(labels)}")

# ---------------------------------------------------------------------------
# Train / val split
# ---------------------------------------------------------------------------

from sklearn.model_selection import train_test_split  # noqa: E402

train_texts, val_texts, train_labels, val_labels = train_test_split(
    texts, labels, test_size=TEST_SPLIT, random_state=SEED, stratify=labels
)
print(f"  train: {len(train_texts)}  val: {len(val_texts)}")

# ---------------------------------------------------------------------------
# Tokenizer + dataset
# ---------------------------------------------------------------------------

from transformers import AutoTokenizer, DataCollatorWithPadding  # noqa: E402
from datasets import Dataset  # noqa: E402

tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)


def tokenize(batch):
    return tokenizer(batch["text"], truncation=True, max_length=MAX_SEQ_LEN, padding=False)


train_ds = Dataset.from_dict({"text": train_texts, "label": train_labels}).map(
    tokenize, batched=True
)
val_ds = Dataset.from_dict({"text": val_texts, "label": val_labels}).map(tokenize, batched=True)

# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

from transformers import AutoModelForSequenceClassification  # noqa: E402

model = AutoModelForSequenceClassification.from_pretrained(
    BASE_MODEL,
    num_labels=2,
    id2label=ID2LABEL,
    label2id=LABEL2ID,
)

# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

from transformers import TrainingArguments, Trainer  # noqa: E402
from sklearn.metrics import accuracy_score, classification_report  # noqa: E402


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    return {"accuracy": accuracy_score(labels, preds)}


ckpt_dir = OUTPUT_DIR / "checkpoints"
ckpt_dir.mkdir(parents=True, exist_ok=True)

training_args = TrainingArguments(
    output_dir=str(ckpt_dir),
    num_train_epochs=EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    per_device_eval_batch_size=64,
    learning_rate=LR,
    warmup_ratio=0.1,
    weight_decay=0.01,
    eval_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    metric_for_best_model="accuracy",
    report_to="none",
    logging_steps=50,
    seed=SEED,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_ds,
    eval_dataset=val_ds,
    tokenizer=tokenizer,
    data_collator=DataCollatorWithPadding(tokenizer),
    compute_metrics=compute_metrics,
)

print(f"\nFine-tuning {BASE_MODEL} for {EPOCHS} epochs ...")
t0 = time.time()
trainer.train()
print(f"Training done in {(time.time() - t0) / 60:.1f} min")

# Final eval
results = trainer.evaluate()
print(f"\nValidation accuracy: {results['eval_accuracy']:.4f}")

# Full classification report on val set
val_preds = np.argmax(trainer.predict(val_ds).predictions, axis=-1)
print("\n" + classification_report(val_labels, val_preds, target_names=["small", "large"]))

# ---------------------------------------------------------------------------
# Save model + tokenizer
# ---------------------------------------------------------------------------

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
print(f"\nSaving model + tokenizer to {OUTPUT_DIR} ...")
trainer.save_model(str(OUTPUT_DIR))
tokenizer.save_pretrained(str(OUTPUT_DIR))

# ---------------------------------------------------------------------------
# Export float32 ONNX
# ---------------------------------------------------------------------------

print("\nExporting float32 ONNX ...")
from optimum.onnxruntime import ORTModelForSequenceClassification  # noqa: E402

ort_model = ORTModelForSequenceClassification.from_pretrained(str(OUTPUT_DIR), export=True)
onnx_path = OUTPUT_DIR / "model.onnx"
ort_model.save_pretrained(str(OUTPUT_DIR))
# optimum saves as model.onnx inside the directory
print(f"  -> {onnx_path}")

# ---------------------------------------------------------------------------
# Export int8 quantized ONNX
# ---------------------------------------------------------------------------

print("Exporting int8 quantized ONNX ...")
from optimum.onnxruntime import ORTQuantizer  # noqa: E402
from optimum.onnxruntime.configuration import AutoQuantizationConfig  # noqa: E402

quantizer = ORTQuantizer.from_pretrained(ort_model)
qconfig = AutoQuantizationConfig.avx2(is_static=False, per_channel=False)
quantizer.quantize(
    save_dir=str(OUTPUT_DIR),
    quantization_config=qconfig,
    file_suffix="int8",
)
print(f"  -> {OUTPUT_DIR / 'model_int8.onnx'}")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

print("\n=== Output files ===")
for f in sorted(OUTPUT_DIR.glob("*")):
    if f.is_file():
        print(f"  {f.name:<35} {f.stat().st_size / 1e6:.1f} MB")

print(f"""
Done! To use in onnx-middleware:
  cp {OUTPUT_DIR}/model_int8.onnx   packages/onnx-middleware/model.onnx
  cp {OUTPUT_DIR}/tokenizer.json    packages/onnx-middleware/data/tokenizer.json
""")
