import json
from datetime import date
from datasets import load_dataset, concatenate_datasets, Value
from classifier.config import AUGMENTED_DATASET_DIR, DATASET_NAME


def augment():
    print("Loading DevQuasar/llm_router_dataset-synth (train split)...")
    synth = load_dataset(DATASET_NAME, split="train")
    synth = synth.select_columns(["prompt", "label"])
    synth = synth.cast_column("label", Value("int64"))

    print("Loading routellm/gpt4_dataset (train split)...")
    routellm = load_dataset("routellm/gpt4_dataset", split="train")
    # mixtral_score >= 4 → 0 (small), <= 3 → 1 (large)
    routellm = routellm.map(lambda x: {"label": 0 if x["mixtral_score"] >= 4 else 1})
    routellm = routellm.select_columns(["prompt", "label"])

    print(f"Synth rows: {len(synth)}, RouteLLM rows: {len(routellm)}")

    combined = concatenate_datasets([synth, routellm]).shuffle(seed=42)

    # Undersample majority class to achieve 50/50 balance
    small = combined.filter(lambda x: x["label"] == 0)
    large = combined.filter(lambda x: x["label"] == 1)
    minority = min(len(small), len(large))
    small = small.select(range(minority))
    large = large.select(range(minority))
    combined = concatenate_datasets([small, large]).shuffle(seed=42)

    total = len(combined)
    small_count = minority
    large_count = minority

    print(f"\nBalanced dataset: {total} rows (50/50)")
    print(f"  small (0): {small_count} ({small_count/total:.1%})")
    print(f"  large (1): {large_count} ({large_count/total:.1%})")

    # Validate labels
    unique_labels = set(combined["label"])
    assert unique_labels == {0, 1}, f"Unexpected labels in dataset: {unique_labels}"

    import os
    if os.path.exists(AUGMENTED_DATASET_DIR):
        print(f"WARNING: overwriting existing dataset at {AUGMENTED_DATASET_DIR}")

    print(f"\nSaving to {AUGMENTED_DATASET_DIR}...")
    combined.save_to_disk(AUGMENTED_DATASET_DIR)

    metadata = {
        "version": "v2",
        "datasets": [DATASET_NAME, "routellm/gpt4_dataset"],
        "train_rows": total,
        "label_dist": {
            "small": round(small_count / total, 4),
            "large": round(large_count / total, 4),
        },
        "created_at": date.today().isoformat(),
    }
    with open(f"{AUGMENTED_DATASET_DIR}/metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"Saved metadata to {AUGMENTED_DATASET_DIR}/metadata.json")
    print("Done.")


if __name__ == "__main__":
    augment()
