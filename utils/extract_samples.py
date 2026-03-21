from datasets import load_from_disk
import json, os

dataset = load_from_disk("data/E2H-AMC")
os.makedirs("data/samples/by_category", exist_ok=True)

for split in ["train", "eval"]:
    seen = set()
    samples = []
    for row in dataset[split]:
        key = (row["contest"], row["tag"], row["subtest"])
        if key not in seen:
            seen.add(key)
            samples.append(row)

    outpath = f"data/samples/by_category/{split}_by_category.json"
    with open(outpath, "w") as f:
        json.dump(samples, f, indent=2)

    print(f"\n=== {split.upper()} — {len(samples)} unique combinations ===")
    for s in samples:
        print(f"  {s['contest']} / {s['tag']} / {s['subtest']}  (rating: {s['rating']:.3f})")
