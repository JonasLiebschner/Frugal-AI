from __future__ import annotations

import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from .io_utils import ensure_parent, read_jsonl, write_csv, write_jsonl
from .model_clients import ModelClient, OllamaClient
from .scoring import score_prediction


BENCHMARK_SYSTEM_PROMPT_PREFIX = (
    "You are taking an automated benchmark scored by an exact string parser. "
    "Use only the information in the user prompt. "
    "Do not explain your reasoning, do not show chain-of-thought, do not restate the question, "
    "and do not output any text after the final answer line. "
    "If you are unsure, make your single best guess."
)


def run_manifest(
    manifest_path: Path,
    client: ModelClient,
    base_url: str,
    models: list[str],
    out_dir: Path,
    system_prompt: str | None,
    temperature: float,
    num_predict: int | None,
    max_workers: int,
    pricing_path: Path | None,
) -> dict[str, Path]:
    manifest = read_jsonl(manifest_path)
    installed_models = set(client.list_models())
    if isinstance(client, OllamaClient):
        missing = [model for model in models if model not in installed_models]
        if missing:
            raise RuntimeError(
                f"These models are not installed on {base_url}: {', '.join(missing)}"
            )

    out_dir.mkdir(parents=True, exist_ok=True)
    pricing_map = _load_pricing_map(pricing_path)
    jobs = [(model, record) for model in models for record in manifest]
    predictions: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                _run_single_prediction,
                client,
                model,
                record,
                system_prompt,
                temperature,
                num_predict,
                pricing_map,
            )
            for model, record in jobs
        ]
        for future in as_completed(futures):
            predictions.append(future.result())

    predictions.sort(key=lambda row: (str(row["model"]), str(row["task_id"]), str(row["sample_id"])))
    predictions_jsonl = out_dir / "predictions.jsonl"
    predictions_csv = out_dir / "predictions.csv"
    write_jsonl(predictions_jsonl, predictions)
    write_csv(predictions_csv, predictions, fieldnames=_prediction_fieldnames(predictions))

    summary_by_model = build_summary(predictions, group_key="model")
    summary_by_task = build_summary(predictions, group_key="task_id")
    summary_by_model_task = build_summary(predictions, group_key=("model", "task_id"))

    model_summary_path = out_dir / "summary_by_model.csv"
    task_summary_path = out_dir / "summary_by_task.csv"
    model_task_summary_path = out_dir / "summary_by_model_task.csv"
    write_csv(model_summary_path, summary_by_model, fieldnames=list(summary_by_model[0].keys()) if summary_by_model else [])
    write_csv(task_summary_path, summary_by_task, fieldnames=list(summary_by_task[0].keys()) if summary_by_task else [])
    write_csv(model_task_summary_path, summary_by_model_task, fieldnames=list(summary_by_model_task[0].keys()) if summary_by_model_task else [])

    metadata_path = out_dir / "run_metadata.json"
    ensure_parent(metadata_path)
    metadata_path.write_text(
        json.dumps(
            {
                "base_url": base_url,
                "models": models,
                "manifest_path": str(manifest_path),
                "system_prompt": system_prompt,
                "temperature": temperature,
                "num_predict": num_predict,
                "max_workers": max_workers,
                "prediction_count": len(predictions),
                "pricing_path": str(pricing_path) if pricing_path else None,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    return {
        "predictions_jsonl": predictions_jsonl,
        "predictions_csv": predictions_csv,
        "summary_by_model": model_summary_path,
        "summary_by_task": task_summary_path,
        "summary_by_model_task": model_task_summary_path,
        "run_metadata": metadata_path,
    }


def build_summary(predictions: list[dict[str, Any]], group_key: str | tuple[str, str]) -> list[dict[str, Any]]:
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    if isinstance(group_key, tuple):
        for row in predictions:
            grouped[tuple(row[key] for key in group_key)].append(row)
    else:
        for row in predictions:
            grouped[(row[group_key],)].append(row)

    summary_rows: list[dict[str, Any]] = []
    for key, rows in sorted(grouped.items()):
        total = len(rows)
        completed = [row for row in rows if not row["error"]]
        correct = [row for row in completed if row["is_correct"]]
        avg_latency = round(sum(float(row["latency_seconds"] or 0.0) for row in completed) / len(completed), 4) if completed else None
        avg_prompt_tokens = _average_int_field(completed, "prompt_eval_count")
        avg_eval_tokens = _average_int_field(completed, "eval_count")
        avg_cost = _average_float_field(completed, "estimated_cost_usd")
        total_cost = _sum_float_field(completed, "estimated_cost_usd")
        item: dict[str, Any] = {
            "total": total,
            "completed": len(completed),
            "errors": total - len(completed),
            "accuracy": round(len(correct) / len(completed), 4) if completed else None,
            "avg_latency_seconds": avg_latency,
            "avg_prompt_eval_count": avg_prompt_tokens,
            "avg_eval_count": avg_eval_tokens,
            "avg_estimated_cost_usd": avg_cost,
            "total_estimated_cost_usd": total_cost,
        }
        if isinstance(group_key, tuple):
            for idx, name in enumerate(group_key):
                item[name] = key[idx]
        else:
            item[group_key] = key[0]
        summary_rows.append(item)
    return summary_rows


def _run_single_prediction(
    client: ModelClient,
    model: str,
    record: dict[str, Any],
    system_prompt: str | None,
    temperature: float,
    num_predict: int | None,
    pricing_map: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    pricing = pricing_map.get(model)
    effective_system_prompt = _build_effective_system_prompt(
        answer_mode=str(record["answer_mode"]),
        user_system_prompt=system_prompt,
    )
    base = {
        "model": model,
        "task_id": record["task_id"],
        "sample_id": record["sample_id"],
        "gold_answer": record["gold_answer"],
        "answer_mode": record["answer_mode"],
        "metadata_json": json.dumps(record.get("metadata", {}), ensure_ascii=False),
        "prompt": record["prompt"],
        "response_text": None,
        "parsed_answer": None,
        "parse_source": None,
        "is_correct": None,
        "latency_seconds": None,
        "prompt_eval_count": None,
        "eval_count": None,
        "prompt_eval_duration_ns": None,
        "eval_duration_ns": None,
        "load_duration_ns": None,
        "total_duration_ns": None,
        "done_reason": None,
        "pricing_model_name": pricing.get("pricing_model_name") if pricing else None,
        "pricing_source_url": pricing.get("pricing_source_url") if pricing else None,
        "input_price_per_million_usd": pricing.get("input_price_per_million_usd") if pricing else None,
        "output_price_per_million_usd": pricing.get("output_price_per_million_usd") if pricing else None,
        "estimated_cost_usd": None,
        "error": None,
    }
    try:
        result = client.generate(
            model=model,
            prompt=str(record["prompt"]),
            system=effective_system_prompt,
            temperature=temperature,
            num_predict=num_predict,
        )
        parsed_answer, is_correct, parse_source = score_prediction(
            answer_mode=str(record["answer_mode"]),
            gold_answer=str(record["gold_answer"]),
            response_text=result.response_text,
            fallback_text=_extract_fallback_parse_text(result.raw),
        )
        base.update(
            {
                "response_text": result.response_text,
                "parsed_answer": parsed_answer,
                "parse_source": parse_source,
                "is_correct": is_correct,
                "latency_seconds": round(result.latency_seconds, 4),
                "prompt_eval_count": result.raw.get("prompt_eval_count"),
                "eval_count": result.raw.get("eval_count"),
                "prompt_eval_duration_ns": result.raw.get("prompt_eval_duration"),
                "eval_duration_ns": result.raw.get("eval_duration"),
                "load_duration_ns": result.raw.get("load_duration"),
                "total_duration_ns": result.raw.get("total_duration"),
                "done_reason": result.raw.get("done_reason"),
            }
        )
        estimated_cost = _estimate_token_proxy_cost(
            prompt_eval_count=base["prompt_eval_count"],
            eval_count=base["eval_count"],
            pricing=pricing,
        )
        base["estimated_cost_usd"] = estimated_cost
    except Exception as exc:  # pragma: no cover - runtime integration branch
        base["error"] = str(exc)
    return base


def _average_int_field(rows: list[dict[str, Any]], field: str) -> float | None:
    values = [int(row[field]) for row in rows if row[field] is not None]
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def _average_float_field(rows: list[dict[str, Any]], field: str) -> float | None:
    values = [float(row[field]) for row in rows if row[field] is not None]
    if not values:
        return None
    return round(sum(values) / len(values), 8)


def _sum_float_field(rows: list[dict[str, Any]], field: str) -> float | None:
    values = [float(row[field]) for row in rows if row[field] is not None]
    if not values:
        return None
    return round(sum(values), 8)


def _load_pricing_map(pricing_path: Path | None) -> dict[str, dict[str, Any]]:
    if pricing_path is None:
        return {}
    payload = json.loads(pricing_path.read_text(encoding="utf-8"))
    models = payload.get("models", {})
    if not isinstance(models, dict):
        raise ValueError("Pricing file must contain a top-level 'models' object.")
    return models


def _estimate_token_proxy_cost(
    prompt_eval_count: Any,
    eval_count: Any,
    pricing: dict[str, Any] | None,
) -> float | None:
    if pricing is None:
        return None
    if prompt_eval_count is None or eval_count is None:
        return None
    input_price = pricing.get("input_price_per_million_usd")
    output_price = pricing.get("output_price_per_million_usd")
    if input_price is None or output_price is None:
        return None
    total = (float(prompt_eval_count) * float(input_price) / 1_000_000.0) + (
        float(eval_count) * float(output_price) / 1_000_000.0
    )
    return round(total, 10)


def _prediction_fieldnames(rows: list[dict[str, Any]]) -> list[str]:
    if not rows:
        return []
    seen: list[str] = []
    for row in rows:
        for key in row.keys():
            if key not in seen:
                seen.append(key)
    return seen


def _build_effective_system_prompt(answer_mode: str, user_system_prompt: str | None) -> str:
    format_line = _required_answer_format(answer_mode)
    extraction_note = _extraction_note(answer_mode)
    parts = [BENCHMARK_SYSTEM_PROMPT_PREFIX]
    if user_system_prompt:
        parts.append(user_system_prompt.strip())
    parts.append(
        "The evaluator extracts only the final answer marker below.\n"
        f"{extraction_note}\n"
        "Return exactly one final line in this format and nothing after it:\n"
        f"{format_line}\n"
        "Good example:\n"
        f"{_good_example(answer_mode)}\n"
        "Bad examples:\n"
        f"{_bad_examples(answer_mode)}"
    )
    return "\n\n".join(parts)


def _required_answer_format(answer_mode: str) -> str:
    if answer_mode == "choice_abcd":
        return "FINAL_ANSWER: <A|B|C|D>"
    if answer_mode == "choice_12":
        return "FINAL_ANSWER: <1|2>"
    if answer_mode == "number":
        return "FINAL_ANSWER: <number>"
    raise ValueError(f"Unsupported answer mode: {answer_mode}")


def _extraction_note(answer_mode: str) -> str:
    if answer_mode == "choice_abcd":
        return (
            "Choose exactly one option letter from A, B, C, or D. "
            "Do not write the option text, only the letter."
        )
    if answer_mode == "choice_12":
        return (
            "Choose exactly one option digit from 1 or 2. "
            "Do not use A or B. Even if the model internally maps the two choices to A/B, "
            "your final answer must still be the digit 1 or 2."
        )
    if answer_mode == "number":
        return (
            "Return only the final numeric answer. "
            "Do not include units, commas, equations, or explanatory text."
        )
    raise ValueError(f"Unsupported answer mode: {answer_mode}")


def _good_example(answer_mode: str) -> str:
    if answer_mode == "choice_abcd":
        return "FINAL_ANSWER: B"
    if answer_mode == "choice_12":
        return "FINAL_ANSWER: 2"
    if answer_mode == "number":
        return "FINAL_ANSWER: 42"
    raise ValueError(f"Unsupported answer mode: {answer_mode}")


def _bad_examples(answer_mode: str) -> str:
    if answer_mode == "choice_abcd":
        return "- The answer is B\n- B because ...\n- FINAL_ANSWER: Option B"
    if answer_mode == "choice_12":
        return "- I choose 2\n- FINAL_ANSWER: option 2\n- FINAL_ANSWER: A\n- FINAL_ANSWER: B"
    if answer_mode == "number":
        return "- The answer is 42\n- FINAL_ANSWER: 42 dollars\n- FINAL_ANSWER: x = 42"
    raise ValueError(f"Unsupported answer mode: {answer_mode}")


def _extract_fallback_parse_text(raw: dict[str, Any]) -> str | None:
    thinking = raw.get("thinking")
    if isinstance(thinking, str) and thinking.strip():
        return thinking
    return None
