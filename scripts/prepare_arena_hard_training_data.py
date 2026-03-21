from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any

import pandas as pd
from datasets import load_dataset


CRITERIA_COLUMNS = [
    "specificity",
    "domain_knowledge",
    "complexity",
    "problem_solving",
    "creativity",
    "technical_accuracy",
    "real_world",
]


def main() -> None:
    args = build_parser().parse_args()
    rubric = json.loads(args.rubric.read_text(encoding="utf-8"))
    raw_csv = args.out_dir / "arena_hard_training_raw.csv"
    dedup_csv = args.out_dir / "arena_hard_training_dedup.csv"
    metadata_json = args.out_dir / "arena_hard_training_metadata.json"
    args.out_dir.mkdir(parents=True, exist_ok=True)

    if args.source_csv:
        rows_written = _filter_existing_rows(
            source_csv=args.source_csv,
            out_path=raw_csv,
            language=args.language,
            max_rows=args.max_rows,
            include_code=args.include_code,
            exclude_winners=args.exclude_winner,
            rubric=rubric,
        )
    else:
        rows_written = _stream_rows(
            out_path=raw_csv,
            language=args.language,
            max_rows=args.max_rows,
            include_code=args.include_code,
            exclude_winners=args.exclude_winner,
            rubric=rubric,
        )
    dedup_stats = _build_deduped_view(raw_csv, dedup_csv, rubric)
    metadata = {
        "dataset": "lmarena-ai/arena-human-preference-140k",
        "language": args.language,
        "max_rows": args.max_rows,
        "include_code": args.include_code,
        "exclude_winner": args.exclude_winner,
        "raw_rows_written": rows_written,
        "dedup_stats": dedup_stats,
        "raw_csv": str(raw_csv),
        "dedup_csv": str(dedup_csv),
    }
    metadata_json.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Prepare LM Arena prompt-level training data.")
    parser.add_argument("--out-dir", type=Path, default=Path("data/arena_hard_training"))
    parser.add_argument(
        "--rubric",
        type=Path,
        default=Path("configs/arena_hard_rubric.example.json"),
    )
    parser.add_argument("--source-csv", type=Path, default=None)
    parser.add_argument("--language", default="en")
    parser.add_argument("--max-rows", type=int, default=50000)
    parser.add_argument("--include-code", action="store_true")
    parser.add_argument("--exclude-winner", action="append", default=[])
    return parser


def _stream_rows(
    out_path: Path,
    language: str,
    max_rows: int,
    include_code: bool,
    exclude_winners: list[str],
    rubric: dict[str, Any],
) -> int:
    dataset = load_dataset("lmarena-ai/arena-human-preference-140k", split="train", streaming=True)
    excluded = set(exclude_winners)
    fieldnames = [
        "id",
        "evaluation_session_id",
        "prompt_hash",
        "prompt",
        "language",
        "is_code",
        "turns",
        "sum_user_tokens",
        "model_a",
        "model_b",
        "winner",
        "hardness_score",
        "escalation_class",
        "weighted_escalation_score",
        "weighted_escalation_class",
    ] + CRITERIA_COLUMNS

    with out_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        rows_written = 0
        for row in dataset:
            if row.get("language") != language:
                continue
            if (not include_code) and bool(row.get("is_code")):
                continue
            if str(row.get("winner")) in excluded:
                continue
            prompt = _extract_prompt(row.get("full_conversation") or [])
            if not prompt:
                continue
            criteria = ((row.get("category_tag") or {}).get("criteria_v0.1") or {})
            if not criteria:
                continue

            output = {
                "id": row.get("id"),
                "evaluation_session_id": row.get("evaluation_session_id"),
                "prompt_hash": hashlib.sha256(prompt.strip().encode("utf-8")).hexdigest(),
                "prompt": prompt.strip(),
                "language": row.get("language"),
                "is_code": bool(row.get("is_code")),
                "turns": ((row.get("conv_metadata") or {}).get("turns")),
                "sum_user_tokens": ((row.get("conv_metadata") or {}).get("sum_user_tokens")),
                "model_a": row.get("model_a"),
                "model_b": row.get("model_b"),
                "winner": row.get("winner"),
            }
            for key in CRITERIA_COLUMNS:
                output[key] = int(bool(criteria.get(key)))
            output["hardness_score"] = sum(int(output[key]) for key in CRITERIA_COLUMNS)
            output["escalation_class"] = _map_escalation(output["hardness_score"], rubric)
            output["weighted_escalation_score"] = _weighted_escalation_score(output, rubric)
            output["weighted_escalation_class"] = _map_weighted_escalation(
                float(output["weighted_escalation_score"]),
                rubric,
            )
            writer.writerow(output)
            rows_written += 1
            if rows_written >= max_rows:
                break
    return rows_written


def _filter_existing_rows(
    source_csv: Path,
    out_path: Path,
    language: str,
    max_rows: int,
    include_code: bool,
    exclude_winners: list[str],
    rubric: dict[str, Any],
) -> int:
    frame = pd.read_csv(source_csv)
    if language:
        frame = frame[frame["language"] == language]
    if not include_code and "is_code" in frame.columns:
        frame = frame[frame["is_code"] == False]  # noqa: E712
    if exclude_winners and "winner" in frame.columns:
        frame = frame[~frame["winner"].isin(exclude_winners)]
    frame = frame.head(max_rows).copy()
    frame["hardness_score"] = frame[CRITERIA_COLUMNS].sum(axis=1)
    frame["escalation_class"] = frame["hardness_score"].apply(lambda value: _map_escalation(int(value), rubric))
    frame["weighted_escalation_score"] = frame.apply(
        lambda row: _weighted_escalation_score(row.to_dict(), rubric),
        axis=1,
    )
    frame["weighted_escalation_class"] = frame["weighted_escalation_score"].apply(
        lambda value: _map_weighted_escalation(float(value), rubric)
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(out_path, index=False)
    return int(len(frame))


def _build_deduped_view(raw_csv: Path, dedup_csv: Path, rubric: dict[str, Any]) -> dict[str, Any]:
    frame = pd.read_csv(raw_csv)
    if frame.empty:
        frame.to_csv(dedup_csv, index=False)
        return {"raw_rows": 0, "dedup_rows": 0}

    aggregation = {
        "prompt": "first",
        "language": "first",
        "is_code": "max",
        "turns": "median",
        "sum_user_tokens": "median",
        "winner": "count",
    }
    for key in CRITERIA_COLUMNS:
        aggregation[key] = "mean"
    grouped = frame.groupby("prompt_hash", as_index=False).agg(aggregation)
    grouped = grouped.rename(columns={"winner": "sample_count"})

    for key in CRITERIA_COLUMNS:
        grouped[key] = (grouped[key] >= 0.5).astype(int)
    grouped["hardness_score"] = grouped[CRITERIA_COLUMNS].sum(axis=1)
    grouped["escalation_class"] = grouped["hardness_score"].apply(lambda value: _map_escalation(int(value), rubric))
    grouped["weighted_escalation_score"] = grouped.apply(
        lambda row: _weighted_escalation_score(row.to_dict(), rubric),
        axis=1,
    )
    grouped["weighted_escalation_class"] = grouped["weighted_escalation_score"].apply(
        lambda value: _map_weighted_escalation(float(value), rubric)
    )
    grouped.to_csv(dedup_csv, index=False)

    return {
        "raw_rows": int(len(frame)),
        "dedup_rows": int(len(grouped)),
        "avg_duplicate_count": round(float(frame.groupby("prompt_hash").size().mean()), 4),
    }


def _extract_prompt(full_conversation: list[dict[str, Any]]) -> str:
    if not full_conversation:
        return ""
    first_turn = full_conversation[0] or {}
    user = first_turn.get("user") or {}
    content = user.get("content") or []
    text_parts: list[str] = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text":
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                text_parts.append(text.strip())
    return "\n".join(text_parts)


def _map_escalation(hardness_score: int, rubric: dict[str, Any]) -> str:
    mapping = rubric.get("escalation_mapping", {})
    for label, bounds in mapping.items():
        if int(bounds["min_score"]) <= hardness_score <= int(bounds["max_score"]):
            return label
    raise ValueError(f"No escalation mapping found for score {hardness_score}")


def _weighted_escalation_score(row: dict[str, Any], rubric: dict[str, Any]) -> float:
    weights = rubric.get("weighted_escalation", {})
    total = 0.0
    for key in CRITERIA_COLUMNS:
        total += float(weights.get(key, 0.0)) * float(row.get(key, 0))
    return round(total, 4)


def _map_weighted_escalation(score: float, rubric: dict[str, Any]) -> str:
    mapping = rubric.get("weighted_escalation_mapping", {})
    for label, bounds in mapping.items():
        lower = float(bounds["min_score"])
        upper = float(bounds["max_score"])
        is_last = upper >= 1.0
        if (lower <= score < upper) or (is_last and lower <= score <= upper):
            return label
    raise ValueError(f"No weighted escalation mapping found for score {score}")


if __name__ == "__main__":
    main()
