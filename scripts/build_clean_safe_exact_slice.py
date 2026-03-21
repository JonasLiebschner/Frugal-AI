from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


def infer_answer_mode(eval_name: str) -> str:
    if eval_name in {"hellaswag", "arc-challenge"} or eval_name.startswith("mmlu-"):
        return "choice_abcd"
    if eval_name == "winogrande":
        return "choice_12"
    if eval_name == "grade-school-math":
        return "number"
    raise ValueError(f"Unsupported eval_name for clean safe exact slice: {eval_name}")


def infer_family(eval_name: str) -> str:
    if eval_name.startswith("mmlu-"):
        return "MMLU"
    if eval_name == "hellaswag":
        return "HellaSwag"
    if eval_name == "grade-school-math":
        return "GSM8K"
    if eval_name == "arc-challenge":
        return "ARC Challenge"
    if eval_name == "winogrande":
        return "Winogrande"
    raise ValueError(f"Unsupported eval_name for family mapping: {eval_name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a clean prompt-selector CSV from the safe exact high-scatter slice.")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/routerbench/high_scatter_safe_exact_1000.csv"),
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("data/routerbench/high_scatter_safe_exact_1000_clean.csv"),
    )
    parser.add_argument(
        "--counts-out",
        type=Path,
        default=Path("data/routerbench/high_scatter_safe_exact_1000_clean_counts_by_eval.csv"),
    )
    parser.add_argument(
        "--family-out",
        type=Path,
        default=Path("data/routerbench/high_scatter_safe_exact_1000_clean_counts_by_family.csv"),
    )
    args = parser.parse_args()

    df = pd.read_csv(args.input)

    clean = pd.DataFrame(
        {
            "selection_rank": df["selection_rank"],
            "sample_id": df["sample_id"],
            "eval_name": df["eval_name"],
            "family": df["eval_name"].map(infer_family),
            "answer_mode": df["eval_name"].map(infer_answer_mode),
            "prompt": df["prompt"],
            "n_models_in_routerbench": df["n_models"],
            "routerbench_mean_performance": df["mean_performance"],
            "routerbench_std_performance": df["std_performance"],
            "routerbench_range_performance": df["range_performance"],
            "routerbench_scatter_score": df["scatter_score"],
        }
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    clean.to_csv(args.out, index=False)

    clean.groupby("eval_name").size().reset_index(name="selected_prompts").sort_values(
        ["selected_prompts", "eval_name"], ascending=[False, True]
    ).to_csv(args.counts_out, index=False)

    clean.groupby("family").size().reset_index(name="selected_prompts").sort_values(
        ["selected_prompts", "family"], ascending=[False, True]
    ).to_csv(args.family_out, index=False)

    print(f"rows={len(clean)}")
    print(f"out={args.out}")
    print(f"counts_out={args.counts_out}")
    print(f"family_out={args.family_out}")


if __name__ == "__main__":
    main()
