from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from .benchmarks import DEFAULT_TASKS, build_manifest
from .io_utils import write_jsonl
from .model_clients import build_client
from .routing import RoutingRequest, load_registry, route_prompt
from .runner import run_manifest


DEFAULT_BASE_URL = "http://172.26.32.29:11434"


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="RouterBench-style Ollama evaluation pipeline.")
    parser.add_argument(
        "--provider",
        choices=["ollama", "openai-compatible"],
        default="ollama",
        help="Backend provider type.",
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Provider base URL.")
    parser.add_argument(
        "--api-key",
        default=None,
        help="API key for openai-compatible providers. Defaults to FRUGAL_BENCH_API_KEY.",
    )
    parser.add_argument("--timeout-seconds", type=int, default=120)
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_models = subparsers.add_parser("list-models", help="List models available on a provider.")
    list_models.set_defaults(func=cmd_list_models)

    build = subparsers.add_parser("build-manifest", help="Create a reproducible evaluation manifest.")
    build.add_argument("--tasks", nargs="+", default=DEFAULT_TASKS)
    build.add_argument("--samples-per-task", type=int, default=25)
    build.add_argument("--shots", type=int, default=5)
    build.add_argument("--seed", type=int, default=42)
    build.add_argument("--out", type=Path, default=Path("manifests/routerbench_exact_manifest.jsonl"))
    build.set_defaults(func=cmd_build_manifest)

    run = subparsers.add_parser("run", help="Run an evaluation manifest against provider models.")
    run.add_argument("--manifest", type=Path, required=True)
    run.add_argument(
        "--models",
        nargs="+",
        required=True,
        help="Model names or the special tokens 'installed'/'available'.",
    )
    run.add_argument("--out-dir", type=Path, default=Path("runs/latest"))
    run.add_argument("--system-prompt", default=None)
    run.add_argument("--temperature", type=float, default=0.0)
    run.add_argument("--num-predict", type=int, default=None)
    run.add_argument("--max-workers", type=int, default=1)
    run.add_argument("--pricing-file", type=Path, default=Path("configs/model_pricing.example.json"))
    run.set_defaults(func=cmd_run)

    route = subparsers.add_parser("route-preview", help="Preview a category-first routing decision.")
    route.add_argument("--prompt", default=None, help="Inline prompt text to analyze.")
    route.add_argument("--prompt-file", type=Path, default=None, help="Path to a text file containing the prompt.")
    route.add_argument(
        "--registry",
        type=Path,
        default=Path("configs/router_registry.example.json"),
        help="Path to the router registry JSON file.",
    )
    route.add_argument("--requires-tools", action="store_true")
    route.add_argument("--requires-json", action="store_true")
    route.add_argument("--requires-vision", action="store_true")
    route.add_argument("--max-latency-tier", choices=["fast", "normal", "relaxed"], default="normal")
    route.add_argument("--estimated-input-tokens", type=int, default=None)
    route.add_argument("--allow-provider", action="append", default=None)
    route.add_argument("--deny-model", action="append", default=None)
    route.set_defaults(func=cmd_route_preview)

    return parser


def cmd_list_models(args: argparse.Namespace) -> None:
    client = _make_client(args)
    models = client.list_models()
    print(
        json.dumps(
            {
                "provider": args.provider,
                "base_url": args.base_url,
                "models": models,
            },
            indent=2,
        )
    )


def cmd_build_manifest(args: argparse.Namespace) -> None:
    records = build_manifest(
        task_ids=args.tasks,
        samples_per_task=args.samples_per_task,
        seed=args.seed,
        shots=args.shots,
    )
    write_jsonl(args.out, [record.to_dict() for record in records])
    print(
        json.dumps(
            {
                "manifest_path": str(args.out),
                "record_count": len(records),
                "tasks": args.tasks,
                "shots": args.shots,
                "samples_per_task": args.samples_per_task,
                "seed": args.seed,
            },
            indent=2,
        )
    )


def cmd_run(args: argparse.Namespace) -> None:
    client = _make_client(args)
    models = client.list_models() if args.models in (["installed"], ["available"]) else args.models
    outputs = run_manifest(
        manifest_path=args.manifest,
        client=client,
        base_url=args.base_url,
        models=models,
        out_dir=args.out_dir,
        system_prompt=args.system_prompt,
        temperature=args.temperature,
        num_predict=args.num_predict,
        max_workers=args.max_workers,
        pricing_path=args.pricing_file,
    )
    print(json.dumps({key: str(value) for key, value in outputs.items()}, indent=2))


def cmd_route_preview(args: argparse.Namespace) -> None:
    prompt = _load_prompt_argument(args.prompt, args.prompt_file)
    registry = load_registry(args.registry)
    decision = route_prompt(
        RoutingRequest(
            prompt=prompt,
            requires_tools=args.requires_tools,
            requires_json=args.requires_json,
            requires_vision=args.requires_vision,
            max_latency_tier=args.max_latency_tier,
            estimated_input_tokens=args.estimated_input_tokens,
            allowed_providers=args.allow_provider,
            denied_models=args.deny_model,
        ),
        registry,
    )
    print(json.dumps(decision.to_dict(), indent=2, ensure_ascii=False))


def _make_client(args: argparse.Namespace):
    api_key = args.api_key or os.getenv("FRUGAL_BENCH_API_KEY")
    return build_client(
        provider=args.provider,
        base_url=args.base_url,
        api_key=api_key,
        timeout_seconds=args.timeout_seconds,
    )


def _load_prompt_argument(prompt: str | None, prompt_file: Path | None) -> str:
    if prompt:
        return prompt
    if prompt_file:
        return prompt_file.read_text(encoding="utf-8")
    raise ValueError("Provide either --prompt or --prompt-file.")


if __name__ == "__main__":
    main()
