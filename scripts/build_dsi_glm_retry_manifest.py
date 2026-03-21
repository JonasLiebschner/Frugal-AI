from __future__ import annotations

import argparse
import csv
from pathlib import Path

from frugal_bench.io_utils import read_jsonl, write_jsonl


ROOT = Path(__file__).resolve().parents[1]
def main() -> None:
    args = build_parser().parse_args()
    source_run = Path(args.source_run)
    base_manifest = Path(args.base_manifest)
    out_manifest = Path(args.out_manifest)

    manifest = read_jsonl(base_manifest)
    by_sample_id = {str(row["sample_id"]): row for row in manifest}

    with (source_run / "predictions.csv").open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    if args.retry_mode == "error":
        retry_ids = [
            row["sample_id"]
            for row in rows
            if row.get("model") == args.model and row.get("error")
        ]
    elif args.retry_mode == "parse_failure":
        retry_ids = [
            row["sample_id"]
            for row in rows
            if row.get("model") == args.model and not row.get("error") and not row.get("parsed_answer")
        ]
    else:
        raise ValueError(f"Unsupported retry mode: {args.retry_mode}")
    retry_records = [by_sample_id[sample_id] for sample_id in retry_ids if sample_id in by_sample_id]
    write_jsonl(out_manifest, retry_records)
    print(f"retry_manifest={out_manifest}")
    print(f"retry_count={len(retry_records)}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build a retry manifest for failed DSI GLM rows.")
    parser.add_argument(
        "--source-run",
        type=Path,
        default=ROOT / "runs" / "high_scatter_binary_only_1000_fresh_dsi_gateway_all",
    )
    parser.add_argument(
        "--base-manifest",
        type=Path,
        default=ROOT / "manifests" / "high_scatter_binary_only_1000.jsonl",
    )
    parser.add_argument(
        "--out-manifest",
        type=Path,
        default=ROOT / "manifests" / "high_scatter_binary_only_1000_fresh_dsi_glm47_retry.jsonl",
    )
    parser.add_argument("--model", default="glm-4.7")
    parser.add_argument("--retry-mode", choices=["error", "parse_failure"], default="error")
    return parser


if __name__ == "__main__":
    main()
