from __future__ import annotations

import argparse
import json
from pathlib import Path

from frugal_bench.io_utils import read_json
from frugal_bench.routing import load_registry
from frugal_bench.svc_router import ArenaHardSVCRouter


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Preview the model-only SVC middleware routing decision.")
    parser.add_argument("--prompt", required=True, help="Prompt text to classify and map to a model.")
    parser.add_argument(
        "--mapping-file",
        type=Path,
        default=Path("configs/svc_middleware_mapping.website_connections.example.json"),
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    mapping = read_json(args.mapping_file)
    router = ArenaHardSVCRouter.from_joblib(mapping["classifier_model_path"])
    registry = load_registry(Path(mapping["registry_file"]))
    decision = router.route(args.prompt, mapping, registry)
    print(
        json.dumps(
            decision.to_middleware_response(include_additional_data=mapping.get("include_additional_data", False)),
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
