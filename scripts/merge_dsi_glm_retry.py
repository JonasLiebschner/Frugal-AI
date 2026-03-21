from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from frugal_bench.io_utils import write_csv, write_jsonl


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    args = build_parser().parse_args()
    target_run = Path(args.target_run)
    retry_run = Path(args.retry_run)
    model = args.model

    original_predictions = read_csv(target_run / "predictions.csv")
    retry_predictions = read_csv(retry_run / "predictions.csv")

    retry_by_sample = {row["sample_id"]: row for row in retry_predictions if row.get("model") == model}
    kept_original = [
        row
        for row in original_predictions
        if row.get("model") == model and row.get("sample_id") not in retry_by_sample
    ]

    merged_predictions = []
    merged_predictions.extend(kept_original)
    merged_predictions.extend(retry_by_sample.values())
    merged_predictions.sort(key=lambda row: (row.get("model", ""), row.get("task_id", ""), row.get("sample_id", "")))

    write_csv(
        target_run / "predictions.csv",
        merged_predictions,
        fieldnames=fieldnames(merged_predictions),
    )
    write_jsonl(target_run / "predictions.jsonl", merged_predictions)

    summary_by_model = build_summary(merged_predictions, "model")
    summary_by_task = build_summary(merged_predictions, "task_id")
    summary_by_model_task = build_summary(merged_predictions, ("model", "task_id"))

    write_csv(target_run / "summary_by_model.csv", summary_by_model, fieldnames(summary_by_model))
    write_csv(target_run / "summary_by_task.csv", summary_by_task, fieldnames(summary_by_task))
    write_csv(target_run / "summary_by_model_task.csv", summary_by_model_task, fieldnames(summary_by_model_task))

    metadata_path = target_run / "run_metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["models"] = [model]
    metadata["merged_retry_run"] = str(retry_run.relative_to(ROOT))
    metadata["notes"] = f"Filtered out non-{model} rows and merged retry rows."
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"merged_predictions={len(merged_predictions)}")
    print(f"target_run={target_run}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Merge a retry-only DSI GLM run back into the target run.")
    parser.add_argument(
        "--target-run",
        type=Path,
        default=ROOT / "runs" / "high_scatter_binary_only_1000_fresh_dsi_gateway_all",
    )
    parser.add_argument(
        "--retry-run",
        type=Path,
        required=True,
    )
    parser.add_argument("--model", default="glm-4.7")
    return parser


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def fieldnames(rows: list[dict[str, Any]]) -> list[str]:
    names: list[str] = []
    for row in rows:
        for key in row.keys():
            if key not in names:
                names.append(key)
    return names


def build_summary(predictions: list[dict[str, str]], group_key: str | tuple[str, str]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, ...], list[dict[str, str]]] = defaultdict(list)
    if isinstance(group_key, tuple):
        for row in predictions:
            grouped[tuple(row[key] for key in group_key)].append(row)
    else:
        for row in predictions:
            grouped[(row[group_key],)].append(row)

    summary_rows: list[dict[str, Any]] = []
    for key, rows in sorted(grouped.items()):
        total = len(rows)
        completed = [row for row in rows if not row.get("error")]
        correct = [row for row in completed if str(row.get("is_correct", "")).lower() == "true"]
        avg_latency = avg_float(completed, "latency_seconds")
        avg_prompt_tokens = avg_float(completed, "prompt_eval_count")
        avg_eval_tokens = avg_float(completed, "eval_count")
        avg_cost = avg_float(completed, "estimated_cost_usd", digits=8)
        total_cost = sum_float(completed, "estimated_cost_usd", digits=8)
        item: dict[str, Any] = {
            "total": total,
            "completed": len(completed),
            "errors": total - len(completed),
            "accuracy": round(len(correct) / len(completed), 4) if completed else None,
            "avg_latency_seconds": avg_latency,
            "avg_prompt_eval_count": avg_prompt_tokens,
            "avg_eval_count": avg_eval_tokens,
            "avg_estimated_cost_usd": avg_cost,
            "total_estimated_cost_usd": total_cost,
        }
        if isinstance(group_key, tuple):
            for idx, name in enumerate(group_key):
                item[name] = key[idx]
        else:
            item[group_key] = key[0]
        summary_rows.append(item)
    return summary_rows


def avg_float(rows: list[dict[str, str]], field: str, digits: int = 4) -> float | None:
    values = [float(row[field]) for row in rows if row.get(field) not in (None, "")]
    if not values:
        return None
    return round(sum(values) / len(values), digits)


def sum_float(rows: list[dict[str, str]], field: str, digits: int = 8) -> float | None:
    values = [float(row[field]) for row in rows if row.get(field) not in (None, "")]
    if not values:
        return None
    return round(sum(values), digits)


if __name__ == "__main__":
    main()
