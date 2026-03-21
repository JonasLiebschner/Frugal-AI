from __future__ import annotations

import csv
import json
import math
from collections import OrderedDict
from pathlib import Path

from frugal_bench.io_utils import write_csv


ROOT = Path(__file__).resolve().parents[1]
BASE_CSV = ROOT / "data" / "routerbench" / "high_scatter_binary_only_1000.csv"
RUNS_DIR = ROOT / "runs"
REPORT_DIR = ROOT / "reports"
PRICING_JSON = ROOT / "configs" / "model_pricing.example.json"
COMBINED_CSV = REPORT_DIR / "high_scatter_binary_only_1000_runs_combined.csv"
PERF_ONLY_CSV = REPORT_DIR / "high_scatter_binary_only_1000_runs_perf_only.csv"
SUMMARY_CSV = REPORT_DIR / "high_scatter_binary_only_1000_model_summary.csv"
REPORT_MD = REPORT_DIR / "high_scatter_binary_only_1000_run_report.md"
EXCLUDED_MODELS = {"glm-4.7"}


def main() -> None:
    base_rows = read_csv(BASE_CSV)
    rows_by_sample_id = OrderedDict((row["sample_id"], dict(row)) for row in base_rows)
    pricing_map = load_pricing_map(PRICING_JSON)

    completed_runs = []
    pending_runs = []

    for run_dir in sorted(RUNS_DIR.glob("high_scatter_binary_only_1000*")):
        if not run_dir.is_dir():
            continue
        predictions_path = run_dir / "predictions.csv"
        summary_path = run_dir / "summary_by_model.csv"
        if predictions_path.exists() and summary_path.exists():
            completed_runs.extend(load_completed_run(run_dir, pricing_map))
        elif "wait" in run_dir.name or "glm_then_devstral" in run_dir.name:
            pending_runs.append(describe_pending_run(run_dir))

    completed_runs.sort(key=lambda item: item["model"])

    for run in completed_runs:
        apply_run_to_rows(rows_by_sample_id, run)

    combined_rows = list(rows_by_sample_id.values())
    add_aggregate_columns(combined_rows, completed_runs)
    write_csv(COMBINED_CSV, combined_rows, list(combined_rows[0].keys()) if combined_rows else [])
    perf_only_rows = build_perf_only_rows(combined_rows)
    write_csv(PERF_ONLY_CSV, perf_only_rows, list(perf_only_rows[0].keys()) if perf_only_rows else [])

    summary_rows = [run["summary"] for run in completed_runs]
    write_csv(SUMMARY_CSV, summary_rows, list(summary_rows[0].keys()) if summary_rows else [])

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_MD.write_text(build_markdown_report(completed_runs, pending_runs), encoding="utf-8")

    print(f"combined_csv={COMBINED_CSV}")
    print(f"perf_only_csv={PERF_ONLY_CSV}")
    print(f"summary_csv={SUMMARY_CSV}")
    print(f"report_md={REPORT_MD}")


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_completed_run(run_dir: Path, pricing_map: dict[str, dict[str, float | str]]) -> list[dict[str, object]]:
    predictions = read_csv(run_dir / "predictions.csv")
    summary_rows = read_csv(run_dir / "summary_by_model.csv")
    summaries_by_model = {row["model"]: row for row in summary_rows}

    by_model: dict[str, list[dict[str, str]]] = {}
    for row in predictions:
        by_model.setdefault(row["model"], []).append(row)

    completed: list[dict[str, object]] = []
    for model, model_rows in sorted(by_model.items()):
        if model in EXCLUDED_MODELS:
            continue
        summary = dict(summaries_by_model.get(model, {}))
        summary["run_dir"] = str(run_dir.relative_to(ROOT))
        summary["parse_success_rate"] = format_float(parse_success_rate(model_rows))
        summary["rows_with_errors"] = str(sum(1 for row in model_rows if row.get("error")))
        backfill_costs(model_rows, summary, pricing_map.get(model))
        completed.append(
            {
                "run_dir": run_dir,
                "model": model,
                "predictions": model_rows,
                "summary": summary,
            }
        )
    return completed


def describe_pending_run(run_dir: Path) -> dict[str, str]:
    err_log = run_dir / "launcher_escalated.err.log"
    detail = ""
    if err_log.exists():
        detail = err_log.read_text(encoding="utf-8", errors="replace").strip().splitlines()[:3]
        detail = " | ".join(detail)
    return {
        "run_dir": str(run_dir.relative_to(ROOT)),
        "detail": detail,
    }


def apply_run_to_rows(rows_by_sample_id: OrderedDict[str, dict[str, str]], run: dict[str, object]) -> None:
    model = str(run["model"])
    perf_col = f"perf__{model}"
    parsed_col = f"parsed__{model}"
    response_col = f"response__{model}"
    error_col = f"error__{model}"
    latency_col = f"latency__{model}"
    done_reason_col = f"done_reason__{model}"

    for row in rows_by_sample_id.values():
        row.setdefault(perf_col, "")
        row.setdefault(parsed_col, "")
        row.setdefault(response_col, "")
        row.setdefault(error_col, "")
        row.setdefault(latency_col, "")
        row.setdefault(done_reason_col, "")

    for pred in run["predictions"]:
        sample_id = pred["sample_id"]
        base_row = rows_by_sample_id.get(sample_id)
        if base_row is None:
            continue
        error = pred.get("error") or ""
        is_correct = pred.get("is_correct")
        perf_value = ""
        if not error:
            perf_value = "1" if str(is_correct).lower() == "true" else "0"
        base_row[perf_col] = perf_value
        base_row[parsed_col] = pred.get("parsed_answer") or ""
        base_row[response_col] = pred.get("response_text") or ""
        base_row[error_col] = error
        base_row[latency_col] = pred.get("latency_seconds") or ""
        base_row[done_reason_col] = pred.get("done_reason") or ""


def add_aggregate_columns(rows: list[dict[str, str]], completed_runs: list[dict[str, object]]) -> None:
    perf_columns = [f"perf__{run['model']}" for run in completed_runs]
    for row in rows:
        scores = [float(row[col]) for col in perf_columns if row.get(col) in {"0", "1"}]
        row["new_n_models"] = str(len(scores))
        row["new_mean_performance"] = format_float(sum(scores) / len(scores) if scores else None)
        row["new_std_performance"] = format_float(stddev(scores))
        row["new_min_performance"] = format_float(min(scores) if scores else None)
        row["new_max_performance"] = format_float(max(scores) if scores else None)
        row["new_range_performance"] = format_float((max(scores) - min(scores)) if scores else None)


def build_perf_only_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    perf_only_rows: list[dict[str, str]] = []
    for row in rows:
        filtered = OrderedDict()
        for key, value in row.items():
            if key.startswith(("parsed__", "response__", "error__", "latency__", "done_reason__")):
                continue
            filtered[key] = value
        perf_only_rows.append(filtered)
    return perf_only_rows


def parse_success_rate(rows: list[dict[str, str]]) -> float | None:
    completed = [row for row in rows if not row.get("error")]
    if not completed:
        return None
    successes = [row for row in completed if row.get("parsed_answer")]
    return len(successes) / len(completed)


def stddev(values: list[float]) -> float | None:
    if not values:
        return None
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    return math.sqrt(variance)


def format_float(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.6f}".rstrip("0").rstrip(".")


def load_pricing_map(path: Path) -> dict[str, dict[str, float | str]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    models = payload.get("models", {})
    if not isinstance(models, dict):
        return {}
    return models


def backfill_costs(
    rows: list[dict[str, str]],
    summary: dict[str, str],
    pricing: dict[str, float | str] | None,
) -> None:
    if not pricing:
        return
    if summary.get("avg_estimated_cost_usd") and summary.get("total_estimated_cost_usd"):
        return

    input_price = pricing.get("input_price_per_million_usd")
    output_price = pricing.get("output_price_per_million_usd")
    if input_price is None or output_price is None:
        return

    costs: list[float] = []
    for row in rows:
        if row.get("error"):
            continue
        prompt_tokens = parse_float(row.get("prompt_eval_count"))
        completion_tokens = parse_float(row.get("eval_count"))
        if prompt_tokens is None or completion_tokens is None:
            continue
        cost = (prompt_tokens * float(input_price) / 1_000_000.0) + (
            completion_tokens * float(output_price) / 1_000_000.0
        )
        costs.append(cost)

    if not costs:
        return

    summary["avg_estimated_cost_usd"] = format_float(sum(costs) / len(costs))
    summary["total_estimated_cost_usd"] = format_float(sum(costs))


def parse_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def build_markdown_report(completed_runs: list[dict[str, object]], pending_runs: list[dict[str, str]]) -> str:
    lines = [
        "# High Scatter Binary Only 1000 Run Report",
        "",
        f"Completed model results: {len(completed_runs)}",
        "",
        "## Completed Runs",
        "",
        "| Model | Run Dir | Total | Completed | Errors | Accuracy | Parse Success | Avg Latency |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for run in completed_runs:
        summary = run["summary"]
        lines.append(
            "| {model} | {run_dir} | {total} | {completed} | {errors} | {accuracy} | {parse_success_rate} | {avg_latency_seconds} |".format(
                model=summary.get("model", ""),
                run_dir=summary.get("run_dir", ""),
                total=summary.get("total", ""),
                completed=summary.get("completed", ""),
                errors=summary.get("errors", ""),
                accuracy=summary.get("accuracy", ""),
                parse_success_rate=summary.get("parse_success_rate", ""),
                avg_latency_seconds=summary.get("avg_latency_seconds", ""),
            )
        )

    lines.extend(
        [
            "",
            "## Generated Artifacts",
            "",
            f"- Combined wide CSV: `{COMBINED_CSV.relative_to(ROOT)}`",
            f"- Perf-only wide CSV: `{PERF_ONLY_CSV.relative_to(ROOT)}`",
            f"- Model summary CSV: `{SUMMARY_CSV.relative_to(ROOT)}`",
            "",
        ]
    )

    if pending_runs:
        lines.extend(
            [
                "## Pending / Failed Wrapper Runs",
                "",
            ]
        )
        for pending in pending_runs:
            lines.append(f"- `{pending['run_dir']}`: {pending['detail'] or 'no detail'}")
        lines.append("")

    lines.extend(
        [
            "## Notes",
            "",
            "- `qwen3.5:35b` completed all rows but had a parse-success rate of 0, so its measured accuracy is not directly comparable without response-format handling.",
            "- `glm-4.7` on the gateway showed many hard errors, while `openai-gpt-oss-120b` completed all rows.",
            "- `high_scatter_binary_only_1000_ministral3_wait_11434` failed to start because its wrapper used the old CLI argument order.",
            "",
        ]
    )

    return "\n".join(lines)


if __name__ == "__main__":
    main()
