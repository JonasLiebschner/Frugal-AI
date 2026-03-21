from __future__ import annotations

import csv
from pathlib import Path

from frugal_bench.io_utils import read_jsonl, write_jsonl


ROOT = Path(__file__).resolve().parents[1]
BASE_MANIFEST = ROOT / "manifests" / "high_scatter_binary_only_1000.jsonl"
RUNS_DIR = ROOT / "runs"
MANIFESTS_DIR = ROOT / "manifests"


def main() -> None:
    manifest = read_jsonl(BASE_MANIFEST)
    by_sample_id = {str(row["sample_id"]): row for row in manifest}

    build_error_retry_manifest(
        predictions_csv=RUNS_DIR / "high_scatter_binary_only_1000_glm47flash_11434" / "predictions.csv",
        model_name="glm-4.7-flash:latest",
        by_sample_id=by_sample_id,
        out_path=MANIFESTS_DIR / "high_scatter_binary_only_1000_glm47flash_retry_102.jsonl",
    )
    build_error_retry_manifest(
        predictions_csv=RUNS_DIR / "high_scatter_binary_only_1000_devstral2_11434" / "predictions.csv",
        model_name="devstral-2:latest",
        by_sample_id=by_sample_id,
        out_path=MANIFESTS_DIR / "high_scatter_binary_only_1000_devstral2_retry_11.jsonl",
    )
    write_jsonl(
        MANIFESTS_DIR / "high_scatter_binary_only_1000_ministral3_full.jsonl",
        manifest,
    )


def build_error_retry_manifest(
    predictions_csv: Path,
    model_name: str,
    by_sample_id: dict[str, dict[str, object]],
    out_path: Path,
) -> None:
    with predictions_csv.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    retry_ids = [
        row["sample_id"]
        for row in rows
        if row.get("model") == model_name and row.get("error")
    ]
    retry_records = [by_sample_id[sample_id] for sample_id in retry_ids if sample_id in by_sample_id]
    write_jsonl(out_path, retry_records)


if __name__ == "__main__":
    main()
