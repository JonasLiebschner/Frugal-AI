from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any, Callable, Iterable


try:
    from datasets import load_dataset
except ImportError:  # pragma: no cover - exercised only when dependency is missing
    load_dataset = None


DEFAULT_TASKS = [
    "hellaswag",
    "arc_challenge",
    "winogrande",
    "gsm8k",
]


def require_datasets() -> Callable[..., Any]:
    if load_dataset is None:
        raise RuntimeError(
            "The 'datasets' package is required to build manifests. "
            "Install it with: pip install -e .[bench]"
        )
    return load_dataset


@dataclass
class ManifestRecord:
    task_id: str
    sample_id: str
    prompt: str
    gold_answer: str
    answer_mode: str
    metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "sample_id": self.sample_id,
            "prompt": self.prompt,
            "gold_answer": self.gold_answer,
            "answer_mode": self.answer_mode,
            "metadata": self.metadata,
        }


@dataclass
class TaskSpec:
    task_id: str
    dataset_name: str
    dataset_config: str | None
    eval_split: str
    support_split: str
    answer_mode: str
    prompt_builder: Callable[[dict[str, Any], list[dict[str, Any]]], tuple[str, str, dict[str, Any]]]


def build_manifest(
    task_ids: list[str],
    samples_per_task: int,
    seed: int,
    shots: int,
) -> list[ManifestRecord]:
    records: list[ManifestRecord] = []
    rng = random.Random(seed)
    for task_id in task_ids:
        spec = get_task_spec(task_id)
        eval_rows = load_split(spec.dataset_name, spec.dataset_config, spec.eval_split)
        support_rows = load_split(spec.dataset_name, spec.dataset_config, spec.support_split)
        sampled_rows = sample_rows(eval_rows, samples_per_task, rng)
        for idx, row in enumerate(sampled_rows):
            support_examples = pick_support_examples(
                rows=support_rows,
                count=shots,
                rng=rng,
                forbid_id=_example_id(task_id, idx, row),
            )
            prompt, gold_answer, metadata = spec.prompt_builder(row, support_examples)
            records.append(
                ManifestRecord(
                    task_id=task_id,
                    sample_id=_example_id(task_id, idx, row),
                    prompt=prompt,
                    gold_answer=gold_answer,
                    answer_mode=spec.answer_mode,
                    metadata=metadata,
                )
            )
    return records


def load_split(dataset_name: str, dataset_config: str | None, split: str) -> list[dict[str, Any]]:
    loader = require_datasets()
    dataset = loader(dataset_name, dataset_config, split=split) if dataset_config else loader(dataset_name, split=split)
    return [dict(row) for row in dataset]


def sample_rows(rows: list[dict[str, Any]], samples_per_task: int, rng: random.Random) -> list[dict[str, Any]]:
    if len(rows) < samples_per_task:
        raise ValueError(f"Requested {samples_per_task} rows but only found {len(rows)}")
    return rng.sample(rows, samples_per_task)


def pick_support_examples(
    rows: list[dict[str, Any]],
    count: int,
    rng: random.Random,
    forbid_id: str,
) -> list[dict[str, Any]]:
    if count <= 0:
        return []
    eligible = [row for row in rows if _safe_row_id(row) != forbid_id]
    if len(eligible) < count:
        raise ValueError(f"Requested {count} support examples but only found {len(eligible)} eligible rows")
    return rng.sample(eligible, count)


def _safe_row_id(row: dict[str, Any]) -> str:
    for key in ("id", "idx", "ind", "sample_id"):
        if key in row:
            return str(row[key])
    return repr(sorted(row.items()))[:200]


def _example_id(task_id: str, idx: int, row: dict[str, Any]) -> str:
    return f"{task_id}:{idx}:{_safe_row_id(row)}"


def get_task_spec(task_id: str) -> TaskSpec:
    if task_id == "hellaswag":
        return TaskSpec(
            task_id=task_id,
            dataset_name="hellaswag",
            dataset_config=None,
            eval_split="validation",
            support_split="train",
            answer_mode="choice_abcd",
            prompt_builder=build_hellaswag_prompt,
        )
    if task_id == "arc_challenge":
        return TaskSpec(
            task_id=task_id,
            dataset_name="allenai/ai2_arc",
            dataset_config="ARC-Challenge",
            eval_split="validation",
            support_split="train",
            answer_mode="choice_abcd",
            prompt_builder=build_arc_prompt,
        )
    if task_id == "winogrande":
        return TaskSpec(
            task_id=task_id,
            dataset_name="winogrande",
            dataset_config="winogrande_xl",
            eval_split="validation",
            support_split="train",
            answer_mode="choice_12",
            prompt_builder=build_winogrande_prompt,
        )
    if task_id == "gsm8k":
        return TaskSpec(
            task_id=task_id,
            dataset_name="openai/gsm8k",
            dataset_config="main",
            eval_split="test",
            support_split="train",
            answer_mode="number",
            prompt_builder=build_gsm8k_prompt,
        )
    if task_id.startswith("mmlu:"):
        subject = task_id.split(":", 1)[1].replace("-", "_")
        return TaskSpec(
            task_id=task_id,
            dataset_name="cais/mmlu",
            dataset_config=subject,
            eval_split="test",
            support_split="dev",
            answer_mode="choice_abcd",
            prompt_builder=build_mmlu_prompt,
        )
    raise ValueError(f"Unsupported task_id: {task_id}")


def build_hellaswag_prompt(row: dict[str, Any], support_examples: list[dict[str, Any]]) -> tuple[str, str, dict[str, Any]]:
    header = "Choose the best ending for each scenario. Respond with only A, B, C, or D."
    prompt = _render_multiple_choice_prompt(
        header=header,
        support_examples=support_examples,
        question_builder=_format_hellaswag_question,
        answer_builder=lambda ex: _index_to_abcd(ex["label"]),
        eval_example=row,
    )
    return prompt, _index_to_abcd(row["label"]), {"eval_name": "hellaswag"}


def build_arc_prompt(row: dict[str, Any], support_examples: list[dict[str, Any]]) -> tuple[str, str, dict[str, Any]]:
    header = "Answer the multiple choice science question. Respond with only A, B, C, or D."
    prompt = _render_multiple_choice_prompt(
        header=header,
        support_examples=support_examples,
        question_builder=_format_arc_question,
        answer_builder=lambda ex: _normalize_arc_label(ex["answerKey"]),
        eval_example=row,
    )
    return prompt, _normalize_arc_label(row["answerKey"]), {"eval_name": "arc-challenge"}


def build_winogrande_prompt(row: dict[str, Any], support_examples: list[dict[str, Any]]) -> tuple[str, str, dict[str, Any]]:
    header = "Fill in the blank with the better option. Respond with only 1 or 2."
    prompt = _render_multiple_choice_prompt(
        header=header,
        support_examples=support_examples,
        question_builder=_format_winogrande_question,
        answer_builder=lambda ex: str(ex["answer"]),
        eval_example=row,
    )
    return prompt, str(row["answer"]), {"eval_name": "winogrande"}


def build_gsm8k_prompt(row: dict[str, Any], support_examples: list[dict[str, Any]]) -> tuple[str, str, dict[str, Any]]:
    header = "Solve each math problem. End the final line with '#### <answer>'."
    shots: list[str] = [header, ""]
    for idx, example in enumerate(support_examples, start=1):
        shots.append(f"Example {idx}\nQuestion: {example['question']}\nAnswer:\n{example['answer']}")
    shots.append(f"Question: {row['question']}\nAnswer:")
    prompt = "\n\n".join(shots)
    return prompt, _extract_gsm8k_final_answer(row["answer"]), {"eval_name": "grade-school-math"}


def build_mmlu_prompt(row: dict[str, Any], support_examples: list[dict[str, Any]]) -> tuple[str, str, dict[str, Any]]:
    header = "Answer the multiple choice question. Respond with only A, B, C, or D."
    prompt = _render_multiple_choice_prompt(
        header=header,
        support_examples=support_examples,
        question_builder=_format_mmlu_question,
        answer_builder=lambda ex: _index_to_abcd(ex["answer"]),
        eval_example=row,
    )
    subject = row.get("subject", "unknown")
    return prompt, _index_to_abcd(row["answer"]), {"eval_name": f"mmlu-{str(subject).replace('_', '-')}"}


def _render_multiple_choice_prompt(
    header: str,
    support_examples: list[dict[str, Any]],
    question_builder: Callable[[dict[str, Any]], str],
    answer_builder: Callable[[dict[str, Any]], str],
    eval_example: dict[str, Any],
) -> str:
    blocks: list[str] = [header]
    for idx, example in enumerate(support_examples, start=1):
        blocks.append(f"Example {idx}\n{question_builder(example)}\nAnswer: {answer_builder(example)}")
    blocks.append(f"Now answer this question.\n{question_builder(eval_example)}\nAnswer:")
    return "\n\n".join(blocks)


def _format_hellaswag_question(row: dict[str, Any]) -> str:
    endings = row["endings"]
    return (
        f"Activity: {row['activity_label']}\n"
        f"Context: {row['ctx_a']} {row['ctx_b']}\n"
        f"A. {endings[0]}\n"
        f"B. {endings[1]}\n"
        f"C. {endings[2]}\n"
        f"D. {endings[3]}"
    )


def _format_arc_question(row: dict[str, Any]) -> str:
    labels = row["choices"]["label"]
    texts = row["choices"]["text"]
    pairs = list(zip(labels, texts))
    rendered = "\n".join(f"{_normalize_arc_label(label)}. {text}" for label, text in pairs)
    return f"Question: {row['question']}\n{rendered}"


def _format_winogrande_question(row: dict[str, Any]) -> str:
    return (
        f"Sentence: {row['sentence']}\n"
        f"1. {row['option1']}\n"
        f"2. {row['option2']}"
    )


def _format_mmlu_question(row: dict[str, Any]) -> str:
    choices = row["choices"]
    return (
        f"Question: {row['question']}\n"
        f"A. {choices[0]}\n"
        f"B. {choices[1]}\n"
        f"C. {choices[2]}\n"
        f"D. {choices[3]}"
    )


def _normalize_arc_label(label: str) -> str:
    if label in {"1", "2", "3", "4"}:
        return _index_to_abcd(int(label) - 1)
    return str(label).upper()


def _index_to_abcd(index: int | str) -> str:
    idx = int(index)
    return ["A", "B", "C", "D"][idx]


def _extract_gsm8k_final_answer(answer: str) -> str:
    if "####" not in answer:
        raise ValueError(f"Unexpected GSM8K answer format: {answer[:100]}")
    return answer.split("####")[-1].strip().replace(",", "")

