from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
from scipy.sparse import hstack

from frugal_bench.routing import RouterRegistry


CRITERIA_COLUMNS = [
    "specificity",
    "domain_knowledge",
    "complexity",
    "problem_solving",
    "creativity",
    "technical_accuracy",
    "real_world",
]

WEIGHTED_ESCALATION_WEIGHTS = {
    "specificity": 0.10,
    "domain_knowledge": 0.15,
    "complexity": 0.25,
    "problem_solving": 0.18,
    "creativity": 0.07,
    "technical_accuracy": 0.18,
    "real_world": 0.07,
}


@dataclass(frozen=True)
class CandidateModelScore:
    model: str
    total_score: float
    base_score: float
    criteria_score: float
    explanation: str


@dataclass(frozen=True)
class RouteDecision:
    model: str
    criteria: dict[str, int]
    hardness_score: int
    hardness_band: str
    weighted_escalation_score: float
    weighted_escalation_class: str
    candidate_scores: list[CandidateModelScore]
    model_reason: str

    def to_middleware_response(self, include_additional_data: bool = False) -> dict[str, Any]:
        payload: dict[str, Any] = {"model": self.model}
        if include_additional_data:
            payload["additionalData"] = {
                "classification": {
                    "criteria": self.criteria,
                    "hardness_score": self.hardness_score,
                    "hardness_band": self.hardness_band,
                    "weighted_escalation_score": self.weighted_escalation_score,
                    "weighted_escalation_class": self.weighted_escalation_class,
                    "classifier_type": "arena_hard_svc",
                    "reason": self.model_reason,
                    "candidate_scores": [
                        {
                            "model": item.model,
                            "total_score": item.total_score,
                            "base_score": item.base_score,
                            "criteria_score": item.criteria_score,
                            "explanation": item.explanation,
                        }
                        for item in self.candidate_scores
                    ],
                }
            }
        return payload


class ArenaHardSVCRouter:
    def __init__(
        self,
        word_vectorizer: Any,
        char_vectorizer: Any,
        estimator: Any,
        criteria_columns: list[str] | None = None,
    ) -> None:
        self.word_vectorizer = word_vectorizer
        self.char_vectorizer = char_vectorizer
        self.estimator = estimator
        self.criteria_columns = criteria_columns or CRITERIA_COLUMNS

    @classmethod
    def from_joblib(cls, model_path: str | Path) -> "ArenaHardSVCRouter":
        artifact = joblib.load(model_path)
        return cls(
            word_vectorizer=artifact["word_vectorizer"],
            char_vectorizer=artifact["char_vectorizer"],
            estimator=artifact["estimator"],
            criteria_columns=artifact.get("criteria_columns", CRITERIA_COLUMNS),
        )

    def predict_criteria(self, prompt: str) -> dict[str, int]:
        word_features = self.word_vectorizer.transform([prompt])
        char_features = self.char_vectorizer.transform([prompt])
        features = hstack([word_features, char_features]).tocsr()
        prediction = self.estimator.predict(features)[0]
        return {name: int(value) for name, value in zip(self.criteria_columns, prediction)}

    def route(self, prompt: str, mapping: dict[str, Any], registry: RouterRegistry) -> RouteDecision:
        criteria = self.predict_criteria(prompt)
        raw_hardness_score = sum(criteria.values())
        hardness_band = map_hardness_band(raw_hardness_score, mapping)
        weighted_score = weighted_escalation_score(criteria)
        escalation_class = weighted_escalation_class(weighted_score, mapping)
        candidate_scores = score_candidate_models(criteria, hardness_band, escalation_class, mapping, registry)
        if candidate_scores:
            model = candidate_scores[0].model
            reason = (
                f"Selected '{model}' from band '{hardness_band}' and escalation '{escalation_class}' "
                f"using criteria-vector tie-break scoring."
            )
        else:
            model, reason = fallback_model(mapping, hardness_band, escalation_class)
        return RouteDecision(
            model=model,
            criteria=criteria,
            hardness_score=raw_hardness_score,
            hardness_band=hardness_band,
            weighted_escalation_score=weighted_score,
            weighted_escalation_class=escalation_class,
            candidate_scores=candidate_scores,
            model_reason=reason,
        )


def weighted_escalation_score(criteria: dict[str, int]) -> float:
    return round(sum(WEIGHTED_ESCALATION_WEIGHTS[key] * criteria[key] for key in WEIGHTED_ESCALATION_WEIGHTS), 4)


def map_hardness_band(hardness_score: int, mapping: dict[str, Any]) -> str:
    banding = mapping.get("hardness_banding", {})
    min_band = int(banding.get("min_band", 1))
    max_band = int(banding.get("max_band", 7))
    if banding.get("clamp_zero_to_h1", True):
        hardness_score = max(min_band, hardness_score)
    hardness_score = min(max_band, max(min_band, hardness_score))
    return f"H{hardness_score}"


def weighted_escalation_class(score: float, mapping: dict[str, Any] | None = None) -> str:
    thresholds = (mapping or {}).get("weighted_escalation_thresholds", {})
    small_cutoff = float(thresholds.get("small_ok_max_exclusive", 0.34))
    mid_cutoff = float(thresholds.get("mid_needed_max_exclusive", 0.64))
    if score < small_cutoff:
        return "small_ok"
    if score < mid_cutoff:
        return "mid_needed"
    return "strong_needed"


def score_candidate_models(
    criteria: dict[str, int],
    hardness_band: str,
    escalation_class: str,
    mapping: dict[str, Any],
    registry: RouterRegistry,
) -> list[CandidateModelScore]:
    candidates = (
        mapping.get("models_by_hardness_band_and_escalation", {})
        .get(hardness_band, {})
        .get(escalation_class, [])
    )
    if isinstance(candidates, str):
        candidates = [candidates]
    criteria_routing = mapping.get("criteria_vector_routing", {})
    base_trait_weights: dict[str, float] = criteria_routing.get("base_trait_weights", {})
    criterion_importance: dict[str, float] = criteria_routing.get("criterion_importance", {})
    criterion_trait_weights: dict[str, dict[str, float]] = criteria_routing.get("criterion_trait_weights", {})
    active_criteria = [name for name, value in criteria.items() if value]

    scored: list[CandidateModelScore] = []
    for candidate in candidates:
        model = registry.models.get(candidate)
        if model is None:
            continue
        base_score = sum(float(model.traits.get(trait, 0.0)) * weight for trait, weight in base_trait_weights.items())
        criteria_score = 0.0
        criterion_explanations: list[str] = []
        for criterion in active_criteria:
            importance = float(criterion_importance.get(criterion, 0.0))
            trait_weights = criterion_trait_weights.get(criterion, {})
            criterion_match = sum(float(model.traits.get(trait, 0.0)) * weight for trait, weight in trait_weights.items())
            weighted_match = importance * criterion_match
            criteria_score += weighted_match
            criterion_explanations.append(f"{criterion}={weighted_match:.3f}")
        total_score = round(base_score + criteria_score, 4)
        scored.append(
            CandidateModelScore(
                model=candidate,
                total_score=total_score,
                base_score=round(base_score, 4),
                criteria_score=round(criteria_score, 4),
                explanation=(
                    f"band={hardness_band}, escalation={escalation_class}, "
                    f"active_criteria={active_criteria}, "
                    f"components={', '.join(criterion_explanations) if criterion_explanations else 'none'}"
                ),
            )
        )
    scored.sort(key=lambda item: item.total_score, reverse=True)
    return scored


def fallback_model(mapping: dict[str, Any], hardness_band: str, escalation_class: str) -> tuple[str, str]:
    model = mapping.get("fallback_model")
    if not model:
        raise KeyError(
            f"No candidate models configured for band '{hardness_band}' and escalation '{escalation_class}', "
            "and no fallback_model set"
        )
    return (
        model,
        f"No valid candidate models found for band '{hardness_band}' and escalation '{escalation_class}', "
        f"falling back to '{model}'",
    )
