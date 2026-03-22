import argparse
import time
import numpy as np
import onnxruntime as ort
from datasets import load_dataset, Dataset
from sklearn.metrics import accuracy_score, f1_score
from transformers import AutoTokenizer

from classifier.config import MODEL_SAVE_DIR, MAX_SEQ_LENGTH, DATASET_NAME, ONNX_INT8_PATH

ONNX_PATH = ONNX_INT8_PATH

# Available test splits: name -> (dataset, split, label_col, label_fn)
# label_fn maps a row to int label (0=small, 1=large); None means use label_col directly
TEST_SPLITS = {
    "synth": (DATASET_NAME, "test", "label", None),
    "routellm": ("routellm/gpt4_dataset", "validation", "mixtral_score",
                 lambda x: 0 if x["mixtral_score"] >= 4 else 1),
}


def load_split(name: str) -> Dataset:
    dataset_name, split, label_col, label_fn = TEST_SPLITS[name]
    ds = load_dataset(dataset_name, split=split)
    if label_fn is not None:
        ds = ds.map(lambda x: {"label": label_fn(x)})
    elif label_col != "label":
        ds = ds.rename_column(label_col, "label")
    return ds.select_columns(["prompt", "label"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--split",
        choices=list(TEST_SPLITS.keys()) + ["all"],
        default="all",
        help="Which test split to evaluate on (default: all)",
    )
    args = parser.parse_args()

    splits_to_run = list(TEST_SPLITS.keys()) if args.split == "all" else [args.split]

    print(f"Loading tokenizer from {MODEL_SAVE_DIR}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_SAVE_DIR)

    print(f"Loading ONNX session from {ONNX_PATH}...")
    session = ort.InferenceSession(ONNX_PATH, providers=["CPUExecutionProvider"])

    for split_name in splits_to_run:
        print(f"\nLoading split '{split_name}'...")
        test_ds = load_split(split_name)

        preds, labels, latencies = [], [], []

        for i, example in enumerate(test_ds):
            inputs = tokenizer(
                example["prompt"],
                return_tensors="np",
                truncation=True,
                max_length=MAX_SEQ_LENGTH,
                padding=True,
            )
            feeds = {
                "input_ids": inputs["input_ids"].astype(np.int64),
                "attention_mask": inputs["attention_mask"].astype(np.int64),
            }

            t0 = time.perf_counter()
            logits = session.run(["logits"], feeds)[0]
            latencies.append((time.perf_counter() - t0) * 1000)

            pred = int(logits.argmax(axis=-1)[0])
            preds.append(pred)
            labels.append(example["label"])

            if (i + 1) % 500 == 0:
                print(f"  {i + 1}/{len(test_ds)} done...")

        accuracy = accuracy_score(labels, preds)
        f1 = f1_score(labels, preds, average="binary")
        avg_latency = np.mean(latencies)
        p50 = np.percentile(latencies, 50)
        p95 = np.percentile(latencies, 95)

        print(f"\n--- Results on '{split_name}' ({len(test_ds)} examples) ---")
        print(f"Accuracy:          {accuracy:.4f}")
        print(f"F1 (binary):       {f1:.4f}")
        print(f"Avg latency:       {avg_latency:.2f}ms")
        print(f"p50 latency:       {p50:.2f}ms")
        print(f"p95 latency:       {p95:.2f}ms")


if __name__ == "__main__":
    main()
