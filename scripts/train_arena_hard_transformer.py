from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from datasets import Dataset
from sklearn.metrics import accuracy_score, classification_report, f1_score, mean_absolute_error
from sklearn.model_selection import train_test_split
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)


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
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    os.environ.setdefault("TRANSFORMERS_NO_ADVISORY_WARNINGS", "1")

    data = pd.read_csv(args.input_csv).dropna(subset=["prompt"]).copy()
    train_df, test_df = train_test_split(data, test_size=args.test_size, random_state=args.seed)

    tokenizer = AutoTokenizer.from_pretrained(
        args.model_name,
        use_fast=True,
        local_files_only=args.local_files_only,
    )
    train_ds = _to_dataset(train_df, tokenizer, args.max_length)
    test_ds = _to_dataset(test_df, tokenizer, args.max_length)

    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=len(CRITERIA_COLUMNS),
        problem_type="multi_label_classification",
        local_files_only=args.local_files_only,
    )

    output_dir = args.out_dir / _safe_model_name(args.model_name)
    output_dir.mkdir(parents=True, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        do_train=True,
        do_eval=True,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_weighted_escalation_accuracy",
        greater_is_better=True,
        per_device_train_batch_size=args.train_batch_size,
        per_device_eval_batch_size=args.eval_batch_size,
        learning_rate=args.learning_rate,
        weight_decay=args.weight_decay,
        num_train_epochs=args.epochs,
        logging_steps=args.logging_steps,
        save_total_limit=1,
        fp16=args.fp16,
        bf16=args.bf16,
        report_to="none",
        seed=args.seed,
        remove_unused_columns=False,
    )

    trainer_kwargs = {
        "model": model,
        "args": training_args,
        "train_dataset": train_ds,
        "eval_dataset": test_ds,
        "data_collator": DataCollatorWithPadding(tokenizer=tokenizer),
        "compute_metrics": _compute_metrics,
    }
    trainer_init_vars = Trainer.__init__.__code__.co_varnames
    if "processing_class" in trainer_init_vars:
        trainer_kwargs["processing_class"] = tokenizer
    elif "tokenizer" in trainer_init_vars:
        trainer_kwargs["tokenizer"] = tokenizer

    trainer = Trainer(**trainer_kwargs)

    trainer.train()
    eval_metrics = trainer.evaluate()
    predictions = trainer.predict(test_ds)
    pred_labels = _logits_to_labels(predictions.predictions)
    pred_frame = pd.DataFrame(pred_labels, columns=CRITERIA_COLUMNS, index=test_df.index)
    truth_frame = test_df[CRITERIA_COLUMNS].copy()

    preview = pd.DataFrame({"prompt": test_df["prompt"].values})
    preview["truth_hardness"] = truth_frame.sum(axis=1).values
    preview["pred_hardness"] = pred_frame.sum(axis=1).values
    truth_weighted = truth_frame.apply(_weighted_escalation_score, axis=1)
    pred_weighted = pred_frame.apply(_weighted_escalation_score, axis=1)
    preview["truth_weighted_escalation_score"] = truth_weighted.values
    preview["pred_weighted_escalation_score"] = pred_weighted.values
    preview["truth_weighted_escalation_class"] = truth_weighted.apply(_map_weighted_escalation).values
    preview["pred_weighted_escalation_class"] = pred_weighted.apply(_map_weighted_escalation).values
    for key in CRITERIA_COLUMNS:
        preview[f"truth_{key}"] = truth_frame[key].values
        preview[f"pred_{key}"] = pred_frame[key].values
    preview.head(args.preview_rows).to_csv(output_dir / "prediction_preview.csv", index=False)

    full_metrics = _build_full_metrics(truth_frame, pred_frame)
    full_metrics["trainer_eval_metrics"] = eval_metrics
    full_metrics["model_name"] = args.model_name
    full_metrics["input_csv"] = str(args.input_csv)
    full_metrics["train_count"] = int(len(train_df))
    full_metrics["test_count"] = int(len(test_df))
    (output_dir / "metrics.json").write_text(json.dumps(full_metrics, indent=2), encoding="utf-8")
    trainer.save_model(str(output_dir / "model"))
    tokenizer.save_pretrained(str(output_dir / "model"))
    print(json.dumps(full_metrics, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train a transformer Arena-Hard criteria classifier.")
    parser.add_argument(
        "--input-csv",
        type=Path,
        default=Path("data/arena_hard_training_no_both_bad/arena_hard_training_dedup.csv"),
    )
    parser.add_argument("--model-name", required=True)
    parser.add_argument("--out-dir", type=Path, default=Path("artifacts/arena_hard_transformers"))
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--train-batch-size", type=int, default=8)
    parser.add_argument("--eval-batch-size", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--logging-steps", type=int, default=50)
    parser.add_argument("--preview-rows", type=int, default=200)
    parser.add_argument("--fp16", action="store_true")
    parser.add_argument("--bf16", action="store_true")
    parser.add_argument("--local-files-only", action="store_true")
    return parser


def _to_dataset(frame: pd.DataFrame, tokenizer: Any, max_length: int) -> Dataset:
    ds = Dataset.from_pandas(frame[["prompt"] + CRITERIA_COLUMNS], preserve_index=False)

    def tokenize(batch: dict[str, list[Any]]) -> dict[str, Any]:
        encoded = tokenizer(
            batch["prompt"],
            truncation=True,
            max_length=max_length,
        )
        labels = []
        row_count = len(batch["prompt"])
        for idx in range(row_count):
            labels.append([float(batch[column][idx]) for column in CRITERIA_COLUMNS])
        encoded["labels"] = labels
        return encoded

    tokenized = ds.map(tokenize, batched=True, remove_columns=ds.column_names)
    return tokenized


def _compute_metrics(eval_pred: Any) -> dict[str, float]:
    if hasattr(eval_pred, "predictions") and hasattr(eval_pred, "label_ids"):
        logits = eval_pred.predictions
        labels = eval_pred.label_ids
    else:
        logits, labels = eval_pred
    pred_frame = pd.DataFrame(_logits_to_labels(logits), columns=CRITERIA_COLUMNS)
    truth_frame = pd.DataFrame(labels, columns=CRITERIA_COLUMNS)
    metrics = _build_full_metrics(truth_frame, pred_frame)
    return {
        "criteria_micro_f1": metrics["criteria_micro_f1"],
        "criteria_macro_f1": metrics["criteria_macro_f1"],
        "exact_match_accuracy": metrics["exact_match_accuracy"],
        "hardness_mae": metrics["hardness_mae"],
        "hardness_escalation_accuracy": metrics["hardness_escalation_accuracy"],
        "weighted_escalation_mae": metrics["weighted_escalation_mae"],
        "weighted_escalation_accuracy": metrics["weighted_escalation_accuracy"],
    }


def _build_full_metrics(truth_frame: pd.DataFrame, pred_frame: pd.DataFrame) -> dict[str, Any]:
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


def _logits_to_labels(logits: np.ndarray) -> np.ndarray:
    probs = 1.0 / (1.0 + np.exp(-logits))
    return (probs >= 0.5).astype(int)


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


def _safe_model_name(name: str) -> str:
    return name.replace("/", "__").replace(":", "_")


if __name__ == "__main__":
    main()
