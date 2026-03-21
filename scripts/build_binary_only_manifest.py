from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd
from datasets import load_dataset


def load_indexed_dataset(name: str, config: str | None, split: str) -> list[dict[str, Any]]:
    dataset = load_dataset(name, config, split=split) if config else load_dataset(name, split=split)
    return [dict(row) for row in dataset]


def split_token_to_hf_split(eval_name: str, split_token: str) -> str:
    if eval_name == "hellaswag":
        return {"train": "train", "val": "validation", "test": "test"}[split_token]
    if eval_name == "arc-challenge":
        return {"train": "train", "val": "validation", "test": "test"}[split_token]
    if eval_name == "winogrande":
        return {"train": "train", "dev": "validation", "test": "test"}[split_token]
    if eval_name.startswith("mmlu-"):
        return {"dev": "dev", "val": "test", "test": "test"}[split_token]
    raise ValueError(f"Unsupported split token mapping for eval_name={eval_name}, split_token={split_token}")


def parse_sample_id(eval_name: str, sample_id: str) -> tuple[str, int]:
    if eval_name == "hellaswag":
        prefix = "hellaswag."
        tail = sample_id[len(prefix):]
        split_token, idx = tail.split(".")
        return split_token, int(idx)
    if eval_name == "arc-challenge":
        prefix = "arc-challenge."
        tail = sample_id[len(prefix):]
        split_token, idx = tail.split(".")
        return split_token, int(idx)
    if eval_name == "winogrande":
        prefix = "winogrande."
        tail = sample_id[len(prefix):]
        split_token, idx = tail.split(".")
        return split_token, int(idx)
    if eval_name.startswith("mmlu-"):
        prefix = f"{eval_name}."
        tail = sample_id[len(prefix):]
        split_token, idx = tail.split(".")
        return split_token, int(idx)
    raise ValueError(f"Unsupported sample_id format for eval_name={eval_name}: {sample_id}")


def infer_answer_mode(eval_name: str) -> str:
    if eval_name in {"hellaswag", "arc-challenge"} or eval_name.startswith("mmlu-"):
        return "choice_abcd"
    if eval_name == "winogrande":
        return "choice_12"
    raise ValueError(f"Unsupported eval_name for binary-only manifest: {eval_name}")


def answer_from_row(eval_name: str, row: dict[str, Any]) -> str:
    if eval_name == "hellaswag":
        return ["A", "B", "C", "D"][int(row["label"])]
    if eval_name == "arc-challenge":
        answer = str(row["answerKey"]).upper()
        if answer in {"1", "2", "3", "4"}:
            return ["A", "B", "C", "D"][int(answer) - 1]
        return answer
    if eval_name == "winogrande":
        return str(row["answer"])
    if eval_name.startswith("mmlu-"):
        return ["A", "B", "C", "D"][int(row["answer"])]
    raise ValueError(f"Unsupported eval_name for answer extraction: {eval_name}")


def dataset_spec(eval_name: str) -> tuple[str, str | None]:
    if eval_name == "hellaswag":
        return "hellaswag", None
    if eval_name == "arc-challenge":
        return "allenai/ai2_arc", "ARC-Challenge"
    if eval_name == "winogrande":
        return "winogrande", "winogrande_xl"
    if eval_name.startswith("mmlu-"):
        subject = eval_name.replace("mmlu-", "").replace("-", "_")
        return "cais/mmlu", subject
    raise ValueError(f"Unsupported eval_name for dataset spec: {eval_name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a gold-answer manifest from the final binary-only RouterBench slice.")
    parser.add_argument(
        "--input-csv",
        type=Path,
        default=Path("data/routerbench/high_scatter_binary_only_1000.csv"),
    )
    parser.add_argument(
        "--out-jsonl",
        type=Path,
        default=Path("manifests/high_scatter_binary_only_1000.jsonl"),
    )
    args = parser.parse_args()

    df = pd.read_csv(args.input_csv)
    args.out_jsonl.parent.mkdir(parents=True, exist_ok=True)

    dataset_cache: dict[tuple[str, str | None, str], list[dict[str, Any]]] = {}
    records: list[dict[str, Any]] = []

    for _, item in df.iterrows():
        eval_name = str(item["eval_name"])
        sample_id = str(item["sample_id"])
        split_token, row_idx = parse_sample_id(eval_name, sample_id)
        hf_split = split_token_to_hf_split(eval_name, split_token)
        ds_name, ds_config = dataset_spec(eval_name)
        cache_key = (ds_name, ds_config, hf_split)
        if cache_key not in dataset_cache:
            dataset_cache[cache_key] = load_indexed_dataset(ds_name, ds_config, hf_split)
        dataset_rows = dataset_cache[cache_key]
        if row_idx >= len(dataset_rows):
            raise IndexError(f"Row index {row_idx} out of bounds for {cache_key}")
        source_row = dataset_rows[row_idx]
        gold_answer = answer_from_row(eval_name, source_row)
        record = {
            "task_id": eval_name if not eval_name.startswith("mmlu-") else f"mmlu:{eval_name.replace('mmlu-', '').replace('-', '_')}",
            "sample_id": sample_id,
            "prompt": item["prompt"],
            "gold_answer": gold_answer,
            "answer_mode": infer_answer_mode(eval_name),
            "metadata": {
                "eval_name": eval_name,
                "family": item["family"],
                "selection_rank": int(item["selection_rank"]),
                "routerbench_mean_performance": float(item["mean_performance"]),
                "routerbench_std_performance": float(item["std_performance"]),
                "routerbench_range_performance": float(item["range_performance"]),
                "routerbench_scatter_score": float(item["scatter_score"]),
                "gold_source_dataset": ds_name,
                "gold_source_config": ds_config,
                "gold_source_split": hf_split,
                "gold_source_row_index": row_idx,
            },
        }
        records.append(record)

    with args.out_jsonl.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"records={len(records)}")
    print(f"manifest={args.out_jsonl}")


if __name__ == "__main__":
    main()
