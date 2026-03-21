from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


BASE_PER_EVAL = 5
MAX_PER_EVAL = 20


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
    if eval_name == "mbpp":
        return "MBPP"
    if eval_name.startswith("mtbench"):
        return "MT-Bench"
    return "RAG / Custom"


def build_prompt_frame(raw_df: pd.DataFrame) -> pd.DataFrame:
    perf_pivot = raw_df.pivot_table(
        index=["sample_id", "eval_name", "prompt"],
        columns="model_name",
        values="performance",
        aggfunc="first",
    )
    perf_pivot.columns = [f"perf__{col}" for col in perf_pivot.columns]
    perf_pivot = perf_pivot.reset_index()

    metrics = (
        raw_df.groupby(["sample_id", "eval_name", "prompt"])
        .agg(
            n_models=("model_name", "count"),
            mean_performance=("performance", "mean"),
            std_performance=("performance", "std"),
            min_performance=("performance", "min"),
            max_performance=("performance", "max"),
        )
        .reset_index()
    )
    metrics["std_performance"] = metrics["std_performance"].fillna(0.0)
    metrics["range_performance"] = metrics["max_performance"] - metrics["min_performance"]
    metrics["disagreement_balance"] = 1.0 - (metrics["mean_performance"] - 0.5).abs() * 2.0
    metrics["difficulty_score"] = 1.0 - metrics["mean_performance"]
    metrics["scatter_score"] = (
        0.65 * metrics["std_performance"]
        + 0.25 * metrics["range_performance"]
        + 0.10 * metrics["difficulty_score"]
    )
    metrics["family"] = metrics["eval_name"].map(infer_family)

    prompt_df = metrics.merge(
        perf_pivot,
        on=["sample_id", "eval_name", "prompt"],
        how="left",
    )
    prompt_df = prompt_df.sort_values(
        ["scatter_score", "std_performance", "range_performance", "difficulty_score"],
        ascending=[False, False, False, False],
    ).reset_index(drop=True)
    return prompt_df


def select_balanced_high_scatter(prompt_df: pd.DataFrame, target_size: int) -> pd.DataFrame:
    selected_chunks: list[pd.DataFrame] = []

    prompt_df = prompt_df.copy()
    prompt_df["rank_within_eval"] = (
        prompt_df.sort_values(
            ["scatter_score", "std_performance", "range_performance", "difficulty_score"],
            ascending=[False, False, False, False],
        )
        .groupby("eval_name")
        .cumcount()
        + 1
    )

    for eval_name, group in prompt_df.groupby("eval_name", sort=False):
        take_n = min(BASE_PER_EVAL, len(group))
        selected_chunks.append(group.head(take_n))

    selected = pd.concat(selected_chunks, ignore_index=True).drop_duplicates(subset=["sample_id"])
    selected_counts = selected["eval_name"].value_counts().to_dict()

    remaining = prompt_df[~prompt_df["sample_id"].isin(selected["sample_id"])].copy()
    extra_rows: list[pd.Series] = []

    for _, row in remaining.iterrows():
        if len(selected) + len(extra_rows) >= target_size:
            break
        eval_name = row["eval_name"]
        current_count = selected_counts.get(eval_name, 0)
        if current_count >= MAX_PER_EVAL:
            continue
        extra_rows.append(row)
        selected_counts[eval_name] = current_count + 1

    if extra_rows:
        extra_df = pd.DataFrame(extra_rows)
        selected = pd.concat([selected, extra_df], ignore_index=True)

    selected = selected.sort_values(
        ["family", "eval_name", "scatter_score", "rank_within_eval"],
        ascending=[True, True, False, True],
    ).reset_index(drop=True)
    selected["selection_rank"] = selected.index + 1
    return selected.head(target_size)


def write_outputs(selected_df: pd.DataFrame, out_csv: Path, counts_csv: Path, family_csv: Path) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    selected_df.to_csv(out_csv, index=False)

    counts = (
        selected_df.groupby("eval_name")
        .size()
        .reset_index(name="selected_prompts")
        .sort_values(["selected_prompts", "eval_name"], ascending=[False, True])
    )
    counts.to_csv(counts_csv, index=False)

    family_counts = (
        selected_df.groupby("family")
        .size()
        .reset_index(name="selected_prompts")
        .sort_values(["selected_prompts", "family"], ascending=[False, True])
    )
    family_counts.to_csv(family_csv, index=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a balanced high-scatter RouterBench prompt slice.")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/routerbench/routerbench_raw.pkl"),
    )
    parser.add_argument(
        "--target-size",
        type=int,
        default=1000,
    )
    parser.add_argument(
        "--out-csv",
        type=Path,
        default=Path("data/routerbench/high_scatter_balanced_1000.csv"),
    )
    parser.add_argument(
        "--counts-csv",
        type=Path,
        default=Path("data/routerbench/high_scatter_balanced_1000_counts_by_eval.csv"),
    )
    parser.add_argument(
        "--family-csv",
        type=Path,
        default=Path("data/routerbench/high_scatter_balanced_1000_counts_by_family.csv"),
    )
    args = parser.parse_args()

    raw_df = pd.read_pickle(args.input)
    prompt_df = build_prompt_frame(raw_df)
    selected_df = select_balanced_high_scatter(prompt_df, target_size=args.target_size)
    write_outputs(selected_df, args.out_csv, args.counts_csv, args.family_csv)

    print(f"selected_prompts={len(selected_df)}")
    print(f"out_csv={args.out_csv}")
    print(f"counts_csv={args.counts_csv}")
    print(f"family_csv={args.family_csv}")


if __name__ == "__main__":
    main()
