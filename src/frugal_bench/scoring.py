from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation


CHOICE_RE = re.compile(r"\b([A-D])\b", re.IGNORECASE)
ONE_TWO_RE = re.compile(r"\b([12])\b")
NUMBER_RE = re.compile(r"-?\d+(?:,\d{3})*(?:\.\d+)?")
FINAL_ANSWER_RE = re.compile(r"FINAL_ANSWER\s*:\s*([^\r\n]+)", re.IGNORECASE)


def normalize_choice(text: str) -> str | None:
    matches = CHOICE_RE.findall(text.upper())
    if not matches:
        return None
    return matches[-1].upper()


def normalize_binary_choice(text: str) -> str | None:
    matches = ONE_TWO_RE.findall(text)
    if not matches:
        return None
    return matches[-1]


def normalize_number(text: str) -> str | None:
    if "####" in text:
        tail = text.split("####")[-1]
        match = NUMBER_RE.search(tail)
        if match:
            return _canon_decimal(match.group(0))

    matches = NUMBER_RE.findall(text)
    if not matches:
        return None
    return _canon_decimal(matches[-1])


def _canon_decimal(value: str) -> str | None:
    cleaned = value.replace(",", "").strip()
    try:
        return format(Decimal(cleaned).normalize(), "f").rstrip("0").rstrip(".") or "0"
    except InvalidOperation:
        return None


def score_prediction(
    answer_mode: str,
    gold_answer: str,
    response_text: str,
    fallback_text: str | None = None,
) -> tuple[str | None, bool, str | None]:
    parsed, parse_source = _parse_answer(
        answer_mode=answer_mode,
        primary_text=response_text,
        fallback_text=fallback_text,
    )
    return parsed, parsed == gold_answer, parse_source


def _parse_answer(
    answer_mode: str,
    primary_text: str,
    fallback_text: str | None,
) -> tuple[str | None, str | None]:
    parsed = _parse_from_text(answer_mode=answer_mode, text=primary_text, allow_unmarked=True)
    if parsed is not None:
        return parsed, "response"

    # Only trust fallback reasoning/thinking text when the model emitted an explicit marker.
    if fallback_text:
        parsed = _parse_from_text(answer_mode=answer_mode, text=fallback_text, allow_unmarked=False)
        if parsed is not None:
            return parsed, "fallback_marker"

    return None, None


def _parse_from_text(answer_mode: str, text: str, allow_unmarked: bool) -> str | None:
    marked = _extract_final_answer_value(text)
    if marked is not None:
        return _normalize_for_mode(answer_mode, marked)

    if not allow_unmarked:
        return None

    return _normalize_for_mode(answer_mode, text)


def _extract_final_answer_value(text: str) -> str | None:
    matches = FINAL_ANSWER_RE.findall(text)
    if not matches:
        return None
    return matches[-1].strip()


def _normalize_for_mode(answer_mode: str, text: str) -> str | None:
    if answer_mode == "choice_abcd":
        return normalize_choice(text)
    if answer_mode == "choice_12":
        return normalize_binary_choice(text)
    if answer_mode == "number":
        return normalize_number(text)
    raise ValueError(f"Unsupported answer mode: {answer_mode}")
