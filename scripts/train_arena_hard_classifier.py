from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import mean_absolute_error
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.multiclass import OneVsRestClassifier
from sklearn.pipeline import Pipeline


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
    data = pd.read_csv(args.input_csv)
    data = data.dropna(subset=["prompt"]).copy()

    X_train, X_test, y_train, y_test = train_test_split(
        data[["prompt"]],
        data[CRITERIA_COLUMNS],
        test_size=args.test_size,
        random_state=args.seed,
    )

    pipeline = Pipeline(
        steps=[
            (
                "features",
                ColumnTransformer(
                    transformers=[
                        (
                            "prompt_tfidf",
                            TfidfVectorizer(ngram_range=(1, 2), min_df=3, max_features=args.max_features),
                            "prompt",
                        )
                    ]
                ),
            ),
            (
                "clf",
                OneVsRestClassifier(
                    LogisticRegression(
                        max_iter=600,
                        class_weight="balanced",
                    )
                ),
            ),
        ]
    )

    pipeline.fit(X_train, y_train)
    predictions = pipeline.predict(X_test)

    pred_frame = pd.DataFrame(predictions, columns=CRITERIA_COLUMNS, index=X_test.index)
    truth_frame = y_test.copy()

    truth_hardness = truth_frame.sum(axis=1)
    pred_hardness = pred_frame.sum(axis=1)
    truth_escalation = truth_hardness.apply(_map_escalation)
    pred_escalation = pred_hardness.apply(_map_escalation)
    truth_weighted = truth_frame.apply(_weighted_escalation_score, axis=1)
    pred_weighted = pred_frame.apply(_weighted_escalation_score, axis=1)
    truth_weighted_escalation = truth_weighted.apply(_map_weighted_escalation)
    pred_weighted_escalation = pred_weighted.apply(_map_weighted_escalation)

    per_label_report = classification_report(
        truth_frame,
        pred_frame,
        target_names=CRITERIA_COLUMNS,
        zero_division=0,
        output_dict=True,
    )
    metrics = {
        "row_count": int(len(data)),
        "train_count": int(len(X_train)),
        "test_count": int(len(X_test)),
        "criteria_micro_f1": round(f1_score(truth_frame, pred_frame, average="micro", zero_division=0), 4),
        "criteria_macro_f1": round(f1_score(truth_frame, pred_frame, average="macro", zero_division=0), 4),
        "exact_match_accuracy": round(accuracy_score(truth_frame, pred_frame), 4),
        "hardness_mae": round(float((truth_hardness - pred_hardness).abs().mean()), 4),
        "hardness_escalation_accuracy": round(accuracy_score(truth_escalation, pred_escalation), 4),
        "weighted_escalation_mae": round(float(mean_absolute_error(truth_weighted, pred_weighted)), 4),
        "weighted_escalation_accuracy": round(accuracy_score(truth_weighted_escalation, pred_weighted_escalation), 4),
        "per_label_report": per_label_report,
    }

    args.out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, args.out_dir / "arena_hard_criteria_classifier.joblib")
    (args.out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    preview = X_test.copy()
    preview["truth_hardness"] = truth_hardness
    preview["pred_hardness"] = pred_hardness
    preview["truth_escalation"] = truth_escalation
    preview["pred_escalation"] = pred_escalation
    preview["truth_weighted_escalation_score"] = truth_weighted
    preview["pred_weighted_escalation_score"] = pred_weighted
    preview["truth_weighted_escalation_class"] = truth_weighted_escalation
    preview["pred_weighted_escalation_class"] = pred_weighted_escalation
    for key in CRITERIA_COLUMNS:
        preview[f"truth_{key}"] = truth_frame[key]
        preview[f"pred_{key}"] = pred_frame[key]
    preview.head(args.preview_rows).to_csv(args.out_dir / "prediction_preview.csv", index=False)

    print(json.dumps(metrics, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train a baseline Arena-Hard criteria classifier.")
    parser.add_argument(
        "--input-csv",
        type=Path,
        default=Path("data/arena_hard_training/arena_hard_training_dedup.csv"),
    )
    parser.add_argument("--out-dir", type=Path, default=Path("artifacts/arena_hard_classifier"))
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-features", type=int, default=50000)
    parser.add_argument("--preview-rows", type=int, default=200)
    return parser


def _map_escalation(hardness_score: int) -> str:
    if hardness_score <= 2:
        return "small_ok"
    if hardness_score <= 4:
        return "mid_needed"
    return "strong_needed"


def _weighted_escalation_score(row: pd.Series) -> float:
    return round(
        0.10 * float(row["specificity"])
        + 0.15 * float(row["domain_knowledge"])
        + 0.25 * float(row["complexity"])
        + 0.18 * float(row["problem_solving"])
        + 0.07 * float(row["creativity"])
        + 0.18 * float(row["technical_accuracy"])
        + 0.07 * float(row["real_world"]),
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
