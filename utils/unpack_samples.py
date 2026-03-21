from datasets import load_from_disk
import json, os

dataset = load_from_disk("data/E2H-AMC")

os.makedirs("data/samples", exist_ok=True)

# Save sample train and eval examples as JSON
with open("data/samples/train_sample.json", "w") as f:
    json.dump(dataset["train"][0], f, indent=2)

with open("data/samples/eval_sample.json", "w") as f:
    json.dump(dataset["eval"][0], f, indent=2)

print("=== TRAIN SAMPLE ===")
for k, v in dataset["train"][0].items():
    val = str(v)[:120] + "..." if len(str(v)) > 120 else v
    print(f"  {k}: {val}")

print("\n=== EVAL SAMPLE ===")
for k, v in dataset["eval"][0].items():
    val = str(v)[:120] + "..." if len(str(v)) > 120 else v
    print(f"  {k}: {val}")
