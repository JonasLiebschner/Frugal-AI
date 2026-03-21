from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
from scipy.sparse import hstack


CRITERIA_COLUMNS = [
    "specificity",
    "domain_knowledge",
    "complexity",
    "problem_solving",
    "creativity",
    "technical_accuracy",
    "real_world",
]


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    mapping_path: Path
    model_path_override: Path | None
    enable_debug_endpoints: bool


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
    reason: str

    def model_only_payload(self) -> dict[str, str]:
        return {"model": self.model}

    def debug_payload(self) -> dict[str, Any]:
        return {
            "model": self.model,
            "additionalData": {
                "classification": {
                    "criteria": self.criteria,
                    "hardness_score": self.hardness_score,
                    "hardness_band": self.hardness_band,
                    "weighted_escalation_score": self.weighted_escalation_score,
                    "weighted_escalation_class": self.weighted_escalation_class,
                    "classifier_type": "arena_hard_svc",
                    "reason": self.reason,
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
            },
        }


@dataclass(frozen=True)
class RegistryModel:
    id: str
    traits: dict[str, float]


class ArenaHardSVCMiddlewareRouter:
    def __init__(
        self,
        word_vectorizer: Any,
        char_vectorizer: Any,
        estimator: Any,
        mapping: dict[str, Any],
        registry_models: dict[str, RegistryModel],
        criteria_columns: list[str] | None = None,
    ) -> None:
        self.word_vectorizer = word_vectorizer
        self.char_vectorizer = char_vectorizer
        self.estimator = estimator
        self.mapping = mapping
        self.registry_models = registry_models
        self.criteria_columns = criteria_columns or CRITERIA_COLUMNS

    @classmethod
    def from_mapping_file(
        cls,
        mapping_path: Path,
        model_path_override: Path | None = None,
    ) -> "ArenaHardSVCMiddlewareRouter":
        mapping = read_json(mapping_path)
        model_path = model_path_override or resolve_from_mapping(mapping_path, mapping["classifier_model_path"])
        registry_path = resolve_from_mapping(mapping_path, mapping["registry_file"])
        artifact = joblib.load(model_path)
        registry_models = load_registry_models(registry_path)
        return cls(
            word_vectorizer=artifact["word_vectorizer"],
            char_vectorizer=artifact["char_vectorizer"],
            estimator=artifact["estimator"],
            mapping=mapping,
            registry_models=registry_models,
            criteria_columns=artifact.get("criteria_columns", CRITERIA_COLUMNS),
        )

    def route(self, prompt: str) -> RouteDecision:
        criteria = self.predict_criteria(prompt)
        raw_hardness_score = sum(criteria.values())
        hardness_band = map_hardness_band(raw_hardness_score, self.mapping)
        weighted_score = weighted_escalation_score(criteria, self.mapping)
        escalation_class = weighted_escalation_class(weighted_score, self.mapping)
        candidate_scores = score_candidate_models(
            criteria=criteria,
            hardness_band=hardness_band,
            escalation_class=escalation_class,
            mapping=self.mapping,
            registry_models=self.registry_models,
        )
        if candidate_scores:
            selected = candidate_scores[0]
            reason = (
                f"Selected '{selected.model}' from band '{hardness_band}' and escalation "
                f"'{escalation_class}' using criteria-vector tie-break scoring."
            )
            model = selected.model
        else:
            model = self.mapping["fallback_model"]
            reason = (
                f"No valid candidate models found for band '{hardness_band}' and escalation "
                f"'{escalation_class}', falling back to '{model}'."
            )
        return RouteDecision(
            model=model,
            criteria=criteria,
            hardness_score=raw_hardness_score,
            hardness_band=hardness_band,
            weighted_escalation_score=weighted_score,
            weighted_escalation_class=escalation_class,
            candidate_scores=candidate_scores,
            reason=reason,
        )

    def predict_criteria(self, prompt: str) -> dict[str, int]:
        word_features = self.word_vectorizer.transform([prompt])
        char_features = self.char_vectorizer.transform([prompt])
        features = hstack([word_features, char_features]).tocsr()
        prediction = self.estimator.predict(features)[0]
        return {name: int(value) for name, value in zip(self.criteria_columns, prediction)}


def load_settings() -> Settings:
    package_root = Path(__file__).resolve().parent
    default_mapping_path = package_root / "config" / "svc_middleware_mapping.website_connections.json"
    mapping_path = Path(
        os.environ.get(
            "SVC_MAPPING_PATH",
            str(default_mapping_path),
        )
    )
    model_override = os.environ.get("SVC_MODEL_PATH")
    return Settings(
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "3004")),
        mapping_path=mapping_path,
        model_path_override=Path(model_override) if model_override else None,
        enable_debug_endpoints=os.environ.get("SVC_ENABLE_DEBUG_ENDPOINTS", "true").lower() == "true",
    )


def weighted_escalation_score(criteria: dict[str, int], mapping: dict[str, Any]) -> float:
    criterion_importance = mapping["criteria_vector_routing"]["criterion_importance"]
    return round(sum(float(criterion_importance[key]) * criteria[key] for key in criterion_importance), 4)


def weighted_escalation_class(score: float, mapping: dict[str, Any]) -> str:
    thresholds = mapping["weighted_escalation_thresholds"]
    if score < float(thresholds["small_ok_max_exclusive"]):
        return "small_ok"
    if score < float(thresholds["mid_needed_max_exclusive"]):
        return "mid_needed"
    return "strong_needed"


def map_hardness_band(hardness_score: int, mapping: dict[str, Any]) -> str:
    banding = mapping["hardness_banding"]
    min_band = int(banding["min_band"])
    max_band = int(banding["max_band"])
    if banding.get("clamp_zero_to_h1", True):
        hardness_score = max(min_band, hardness_score)
    hardness_score = min(max_band, max(min_band, hardness_score))
    return f"H{hardness_score}"


def score_candidate_models(
    criteria: dict[str, int],
    hardness_band: str,
    escalation_class: str,
    mapping: dict[str, Any],
    registry_models: dict[str, RegistryModel],
) -> list[CandidateModelScore]:
    candidates = (
        mapping.get("models_by_hardness_band_and_escalation", {})
        .get(hardness_band, {})
        .get(escalation_class, [])
    )
    if isinstance(candidates, str):
        candidates = [candidates]

    criteria_routing = mapping["criteria_vector_routing"]
    base_trait_weights: dict[str, float] = criteria_routing["base_trait_weights"]
    criterion_importance: dict[str, float] = criteria_routing["criterion_importance"]
    criterion_trait_weights: dict[str, dict[str, float]] = criteria_routing["criterion_trait_weights"]
    active_criteria = [name for name, value in criteria.items() if value]

    scored: list[CandidateModelScore] = []
    for candidate_id in candidates:
        model = registry_models.get(candidate_id)
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
                model=candidate_id,
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


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def resolve_from_mapping(mapping_path: Path, candidate: str) -> Path:
    candidate_path = Path(candidate)
    if candidate_path.is_absolute():
        return candidate_path
    direct = candidate_path
    if direct.exists():
        return direct
    relative_to_mapping = (mapping_path.parent / candidate_path).resolve()
    if relative_to_mapping.exists():
        return relative_to_mapping
    return direct.resolve()


def load_registry_models(path: Path) -> dict[str, RegistryModel]:
    payload = read_json(path)
    return {
        item["id"]: RegistryModel(id=item["id"], traits={key: float(value) for key, value in item.get("traits", {}).items()})
        for item in payload.get("models", [])
    }
