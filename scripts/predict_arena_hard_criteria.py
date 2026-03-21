from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd


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
    pipeline = joblib.load(args.model)
    prompt = args.prompt if args.prompt is not None else args.prompt_file.read_text(encoding="utf-8")
    frame = pd.DataFrame([{"prompt": prompt}])
    predictions = pipeline.predict(frame)[0]
    criteria = {key: int(value) for key, value in zip(CRITERIA_COLUMNS, predictions)}
    hardness_score = sum(criteria.values())
    weighted_escalation_score = _weighted_escalation_score(criteria)
    result = {
        "criteria": criteria,
        "hardness_score": hardness_score,
        "hardness_escalation_class": _map_escalation(hardness_score),
        "weighted_escalation_score": weighted_escalation_score,
        "weighted_escalation_class": _map_weighted_escalation(weighted_escalation_score),
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Predict Arena-Hard criteria for a prompt.")
    parser.add_argument(
        "--model",
        type=Path,
        default=Path("artifacts/arena_hard_classifier/arena_hard_criteria_classifier.joblib"),
    )
    parser.add_argument("--prompt", default=None)
    parser.add_argument("--prompt-file", type=Path, default=None)
    return parser


def _map_escalation(hardness_score: int) -> str:
    if hardness_score <= 2:
        return "small_ok"
    if hardness_score <= 4:
        return "mid_needed"
    return "strong_needed"


def _weighted_escalation_score(criteria: dict[str, int]) -> float:
    return round(
        0.10 * criteria["specificity"]
        + 0.15 * criteria["domain_knowledge"]
        + 0.25 * criteria["complexity"]
        + 0.18 * criteria["problem_solving"]
        + 0.07 * criteria["creativity"]
        + 0.18 * criteria["technical_accuracy"]
        + 0.07 * criteria["real_world"],
        4,
    )


def _map_weighted_escalation(score: float) -> str:
    if score < 0.34:
        return "small_ok"
    if score < 0.64:
        return "mid_needed"
    return "strong_needed"


if __name__ == "__main__":
    main()
