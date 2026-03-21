from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score, mean_absolute_error
from sklearn.model_selection import train_test_split
from sklearn.multiclass import OneVsRestClassifier
from sklearn.multioutput import ClassifierChain
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC


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
    data = pd.read_csv(args.input_csv).dropna(subset=["prompt"]).copy()
    X_train, X_test, y_train, y_test = train_test_split(
        data["prompt"],
        data[CRITERIA_COLUMNS],
        test_size=args.test_size,
        random_state=args.seed,
    )

    train_features, test_features, vectorizers = build_feature_matrices(
        X_train.tolist(),
        X_test.tolist(),
        max_word_features=args.max_word_features,
        max_char_features=args.max_char_features,
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)

    model_specs = [
        (
            "linear_svc_word_char",
            OneVsRestClassifier(LinearSVC(class_weight="balanced", random_state=args.seed)),
        ),
        (
            "classifier_chain_logreg_word_char",
            ClassifierChain(
                LogisticRegression(
                    max_iter=800,
                    class_weight="balanced",
                    solver="liblinear",
                ),
                order="random",
                random_state=args.seed,
            ),
        ),
    ]

    summary: dict[str, Any] = {
        "input_csv": str(args.input_csv),
        "row_count": int(len(data)),
        "train_count": int(len(X_train)),
        "test_count": int(len(X_test)),
        "models": {},
    }

    for model_name, estimator in model_specs:
        estimator.fit(train_features, y_train.values)
        predictions = estimator.predict(test_features)
        pred_frame = pd.DataFrame(predictions, columns=CRITERIA_COLUMNS, index=y_test.index)
        metrics = build_metrics(y_test.copy(), pred_frame)

        model_dir = args.out_dir / model_name
        model_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "word_vectorizer": vectorizers["word"],
                "char_vectorizer": vectorizers["char"],
                "estimator": estimator,
                "criteria_columns": CRITERIA_COLUMNS,
            },
            model_dir / "model.joblib",
        )
        (model_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

        preview = pd.DataFrame({"prompt": X_test})
        preview["truth_hardness"] = y_test.sum(axis=1)
        preview["pred_hardness"] = pred_frame.sum(axis=1)
        preview["truth_weighted_escalation_score"] = y_test.apply(_weighted_escalation_score, axis=1)
        preview["pred_weighted_escalation_score"] = pred_frame.apply(_weighted_escalation_score, axis=1)
        preview["truth_weighted_escalation_class"] = preview["truth_weighted_escalation_score"].apply(_map_weighted_escalation)
        preview["pred_weighted_escalation_class"] = preview["pred_weighted_escalation_score"].apply(_map_weighted_escalation)
        for key in CRITERIA_COLUMNS:
            preview[f"truth_{key}"] = y_test[key]
            preview[f"pred_{key}"] = pred_frame[key]
        preview.head(args.preview_rows).to_csv(model_dir / "prediction_preview.csv", index=False)

        summary["models"][model_name] = metrics

    (args.out_dir / "comparison.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train two stronger classical Arena-Hard classifiers.")
    parser.add_argument(
        "--input-csv",
        type=Path,
        default=Path("data/arena_hard_training_no_both_bad/arena_hard_training_dedup.csv"),
    )
    parser.add_argument("--out-dir", type=Path, default=Path("artifacts/arena_hard_classifier_compare"))
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-word-features", type=int, default=80000)
    parser.add_argument("--max-char-features", type=int, default=50000)
    parser.add_argument("--preview-rows", type=int, default=200)
    return parser


def build_feature_matrices(
    train_texts: list[str],
    test_texts: list[str],
    max_word_features: int,
    max_char_features: int,
):
    word_vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=2,
        max_features=max_word_features,
        sublinear_tf=True,
    )
    char_vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        min_df=2,
        max_features=max_char_features,
        sublinear_tf=True,
    )
    X_train_word = word_vectorizer.fit_transform(train_texts)
    X_test_word = word_vectorizer.transform(test_texts)
    X_train_char = char_vectorizer.fit_transform(train_texts)
    X_test_char = char_vectorizer.transform(test_texts)
    X_train = hstack([X_train_word, X_train_char]).tocsr()
    X_test = hstack([X_test_word, X_test_char]).tocsr()
    return X_train, X_test, {"word": word_vectorizer, "char": char_vectorizer}


def build_metrics(truth_frame: pd.DataFrame, pred_frame: pd.DataFrame) -> dict[str, Any]:
    truth_hardness = truth_frame.sum(axis=1)
    pred_hardness = pred_frame.sum(axis=1)
    truth_escalation = truth_hardness.apply(_map_escalation)
    pred_escalation = pred_hardness.apply(_map_escalation)
    truth_weighted = truth_frame.apply(_weighted_escalation_score, axis=1)
    pred_weighted = pred_frame.apply(_weighted_escalation_score, axis=1)
    truth_weighted_escalation = truth_weighted.apply(_map_weighted_escalation)
    pred_weighted_escalation = pred_weighted.apply(_map_weighted_escalation)

    return {
        "criteria_micro_f1": round(f1_score(truth_frame, pred_frame, average="micro", zero_division=0), 4),
        "criteria_macro_f1": round(f1_score(truth_frame, pred_frame, average="macro", zero_division=0), 4),
        "exact_match_accuracy": round(accuracy_score(truth_frame, pred_frame), 4),
        "hardness_mae": round(float(mean_absolute_error(truth_hardness, pred_hardness)), 4),
        "hardness_escalation_accuracy": round(accuracy_score(truth_escalation, pred_escalation), 4),
        "weighted_escalation_mae": round(float(mean_absolute_error(truth_weighted, pred_weighted)), 4),
        "weighted_escalation_accuracy": round(accuracy_score(truth_weighted_escalation, pred_weighted_escalation), 4),
        "per_label_report": classification_report(
            truth_frame,
            pred_frame,
            target_names=CRITERIA_COLUMNS,
            zero_division=0,
            output_dict=True,
        ),
    }


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
