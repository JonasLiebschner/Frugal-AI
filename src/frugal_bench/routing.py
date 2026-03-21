from __future__ import annotations

import json
import math
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


DEFAULT_CONTEXT_TOKEN_ESTIMATE_DIVISOR = 4


@dataclass
class PromptFeatures:
    prompt_length_chars: int
    estimated_input_tokens: int
    code_signal: float
    reasoning_signal: float
    translation_signal: float
    summarization_signal: float
    extraction_signal: float
    classification_signal: float
    structured_output_signal: float
    tool_signal: float
    latency_signal: float
    safety_signal: float
    long_context_signal: float
    complexity_score: float
    complexity_label: str
    matched_keywords: dict[str, list[str]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class CategoryDefinition:
    id: str
    description: str
    feature_weights: dict[str, float]
    preferred_capabilities: list[str] = field(default_factory=list)
    required_capabilities: list[str] = field(default_factory=list)
    disallowed_capabilities: list[str] = field(default_factory=list)
    complexity_bias: dict[str, float] = field(default_factory=dict)
    keywords_any: list[str] = field(default_factory=list)
    keywords_all: list[str] = field(default_factory=list)
    negative_keywords: list[str] = field(default_factory=list)
    model_trait_weights: dict[str, float] = field(default_factory=dict)


@dataclass
class ModelDefinition:
    id: str
    label: str
    provider: str
    categories: list[str]
    capabilities: list[str]
    max_context_tokens: int
    traits: dict[str, float]
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class RouterRegistry:
    categories: dict[str, CategoryDefinition]
    models: dict[str, ModelDefinition]
    defaults: dict[str, Any] = field(default_factory=dict)


@dataclass
class CategoryScore:
    category_id: str
    score: float
    normalized_score: float
    matched_any_keywords: list[str]
    matched_all_keywords: list[str]
    matched_negative_keywords: list[str]
    explanation: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ModelScore:
    model_id: str
    score: float
    gating_reasons: list[str]
    explanation: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RouteDecision:
    chosen_category: str
    chosen_model: str | None
    category_confidence: float
    fallback_categories: list[str]
    fallback_models: list[str]
    features: PromptFeatures
    category_scores: list[CategoryScore]
    model_scores: list[ModelScore]
    explanation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "chosen_category": self.chosen_category,
            "chosen_model": self.chosen_model,
            "category_confidence": self.category_confidence,
            "fallback_categories": self.fallback_categories,
            "fallback_models": self.fallback_models,
            "features": self.features.to_dict(),
            "category_scores": [item.to_dict() for item in self.category_scores],
            "model_scores": [item.to_dict() for item in self.model_scores],
            "explanation": self.explanation,
        }


@dataclass
class RoutingRequest:
    prompt: str
    requires_tools: bool = False
    requires_json: bool = False
    requires_vision: bool = False
    max_latency_tier: str = "normal"
    estimated_input_tokens: int | None = None
    allowed_providers: list[str] | None = None
    denied_models: list[str] | None = None


def load_registry(path: Path) -> RouterRegistry:
    payload = json.loads(path.read_text(encoding="utf-8"))
    categories = {
        item["id"]: CategoryDefinition(
            id=item["id"],
            description=item.get("description", ""),
            feature_weights=item.get("feature_weights", {}),
            preferred_capabilities=item.get("preferred_capabilities", []),
            required_capabilities=item.get("required_capabilities", []),
            disallowed_capabilities=item.get("disallowed_capabilities", []),
            complexity_bias=item.get("complexity_bias", {}),
            keywords_any=item.get("keywords_any", []),
            keywords_all=item.get("keywords_all", []),
            negative_keywords=item.get("negative_keywords", []),
            model_trait_weights=item.get("model_trait_weights", {}),
        )
        for item in payload.get("categories", [])
    }
    models = {
        item["id"]: ModelDefinition(
            id=item["id"],
            label=item.get("label", item["id"]),
            provider=item.get("provider", "unknown"),
            categories=item.get("categories", []),
            capabilities=item.get("capabilities", []),
            max_context_tokens=int(item.get("max_context_tokens", 0)),
            traits={key: float(value) for key, value in item.get("traits", {}).items()},
            metadata=item.get("metadata", {}),
        )
        for item in payload.get("models", [])
    }
    return RouterRegistry(
        categories=categories,
        models=models,
        defaults=payload.get("defaults", {}),
    )


def route_prompt(request: RoutingRequest, registry: RouterRegistry) -> RouteDecision:
    features = analyze_prompt(request.prompt, registry.defaults, request.estimated_input_tokens)
    category_scores = _score_categories(request, features, registry)
    if not category_scores:
        raise RuntimeError("Router registry has no categories configured.")
    chosen_category = category_scores[0]
    category_confidence = _confidence_from_scores(category_scores)
    model_scores = _score_models(request, features, registry, chosen_category.category_id)
    chosen_model = model_scores[0].model_id if model_scores else None
    fallback_categories = [item.category_id for item in category_scores[1:3]]
    fallback_models = [item.model_id for item in model_scores[1:4]]
    explanation = (
        f"Selected category '{chosen_category.category_id}' with confidence {category_confidence:.3f} "
        f"from prompt signals {features.complexity_label}, code={features.code_signal:.2f}, "
        f"reasoning={features.reasoning_signal:.2f}, structured={features.structured_output_signal:.2f}. "
    )
    if chosen_model:
        explanation += f"Top model in that category is '{chosen_model}'."
    else:
        explanation += "No model passed the category filters."
    return RouteDecision(
        chosen_category=chosen_category.category_id,
        chosen_model=chosen_model,
        category_confidence=category_confidence,
        fallback_categories=fallback_categories,
        fallback_models=fallback_models,
        features=features,
        category_scores=category_scores,
        model_scores=model_scores,
        explanation=explanation,
    )


def analyze_prompt(
    prompt: str,
    defaults: dict[str, Any] | None = None,
    estimated_input_tokens: int | None = None,
) -> PromptFeatures:
    defaults = defaults or {}
    lowered = prompt.lower()
    matched_keywords: dict[str, list[str]] = {}
    token_estimate = estimated_input_tokens or max(1, math.ceil(len(prompt) / DEFAULT_CONTEXT_TOKEN_ESTIMATE_DIVISOR))

    code_keywords = _match_patterns(
        lowered,
        [
            "python", "javascript", "typescript", "sql", "regex", "function", "class ",
            "bug", "stack trace", "refactor", "api", "endpoint", "unit test", "code",
            "compile", "json schema", "yaml", "docker", "fastapi", "react",
        ],
    )
    reasoning_keywords = _match_patterns(
        lowered,
        [
            "analyze", "reason", "why", "compare", "tradeoff", "derive", "prove",
            "plan", "strategy", "root cause", "step by step", "debug", "architecture",
            "best approach", "decide", "decision", "evaluate",
        ],
    )
    translation_keywords = _match_patterns(
        lowered,
        ["translate", "translation", "rewrite in", "in spanish", "in german", "in french"],
    )
    summarization_keywords = _match_patterns(
        lowered,
        ["summarize", "summary", "tl;dr", "key points", "bullet summary", "condense"],
    )
    extraction_keywords = _match_patterns(
        lowered,
        ["extract", "pull out", "fields", "entities", "parse", "find all", "return keys"],
    )
    classification_keywords = _match_patterns(
        lowered,
        ["classify", "label", "category", "sentiment", "intent", "route", "taxonomy"],
    )
    structured_output_keywords = _match_patterns(
        lowered,
        ["json", "schema", "csv", "table", "yaml", "valid json", "structured output", "xml"],
    )
    tool_keywords = _match_patterns(
        lowered,
        ["search", "browse", "look up", "fetch", "call api", "tool", "function call", "retrieve"],
    )
    latency_keywords = _match_patterns(
        lowered,
        ["fast", "quick", "realtime", "real-time", "urgent", "immediately", "low latency"],
    )
    safety_keywords = _match_patterns(
        lowered,
        ["medical", "legal", "financial", "contract", "diagnosis", "prescription", "compliance"],
    )

    matched_keywords.update(
        {
            "code": code_keywords,
            "reasoning": reasoning_keywords,
            "translation": translation_keywords,
            "summarization": summarization_keywords,
            "extraction": extraction_keywords,
            "classification": classification_keywords,
            "structured": structured_output_keywords,
            "tools": tool_keywords,
            "latency": latency_keywords,
            "safety": safety_keywords,
        }
    )

    code_signal = _signal_from_matches(code_keywords, saturation=6)
    reasoning_signal = _signal_from_matches(reasoning_keywords, saturation=6)
    translation_signal = _signal_from_matches(translation_keywords, saturation=3)
    summarization_signal = _signal_from_matches(summarization_keywords, saturation=3)
    extraction_signal = _signal_from_matches(extraction_keywords, saturation=4)
    classification_signal = _signal_from_matches(classification_keywords, saturation=4)
    structured_output_signal = _signal_from_matches(structured_output_keywords, saturation=4)
    tool_signal = _signal_from_matches(tool_keywords, saturation=3)
    latency_signal = _signal_from_matches(latency_keywords, saturation=3)
    safety_signal = _signal_from_matches(safety_keywords, saturation=3)
    long_context_signal = _normalize(
        token_estimate,
        float(defaults.get("context_low_tokens", 1200)),
        float(defaults.get("context_high_tokens", 6000)),
    )

    complexity_score = _clamp(
        0.15
        + (0.20 * reasoning_signal)
        + (0.18 * code_signal)
        + (0.12 * tool_signal)
        + (0.10 * structured_output_signal)
        + (0.10 * safety_signal)
        + (0.15 * long_context_signal)
        + (0.08 if "multi-step" in lowered or "step by step" in lowered else 0.0)
        + (0.05 if len(prompt.split()) > 180 else 0.0)
    )
    complexity_label = _complexity_label(
        complexity_score,
        float(defaults.get("complexity_medium_threshold", 0.42)),
        float(defaults.get("complexity_high_threshold", 0.68)),
    )

    return PromptFeatures(
        prompt_length_chars=len(prompt),
        estimated_input_tokens=token_estimate,
        code_signal=code_signal,
        reasoning_signal=reasoning_signal,
        translation_signal=translation_signal,
        summarization_signal=summarization_signal,
        extraction_signal=extraction_signal,
        classification_signal=classification_signal,
        structured_output_signal=structured_output_signal,
        tool_signal=tool_signal,
        latency_signal=latency_signal,
        safety_signal=safety_signal,
        long_context_signal=long_context_signal,
        complexity_score=round(complexity_score, 4),
        complexity_label=complexity_label,
        matched_keywords=matched_keywords,
    )


def _score_categories(
    request: RoutingRequest,
    features: PromptFeatures,
    registry: RouterRegistry,
) -> list[CategoryScore]:
    results: list[CategoryScore] = []
    feature_map = {
        "code_signal": features.code_signal,
        "reasoning_signal": features.reasoning_signal,
        "translation_signal": features.translation_signal,
        "summarization_signal": features.summarization_signal,
        "extraction_signal": features.extraction_signal,
        "classification_signal": features.classification_signal,
        "structured_output_signal": features.structured_output_signal,
        "tool_signal": features.tool_signal,
        "latency_signal": features.latency_signal,
        "safety_signal": features.safety_signal,
        "long_context_signal": features.long_context_signal,
        "complexity_score": features.complexity_score,
    }
    for category in registry.categories.values():
        raw_score = 0.0
        for name, weight in category.feature_weights.items():
            raw_score += feature_map.get(name, 0.0) * float(weight)

        any_hits = _match_patterns(request.prompt.lower(), category.keywords_any)
        all_hits = _match_patterns(request.prompt.lower(), category.keywords_all)
        negative_hits = _match_patterns(request.prompt.lower(), category.negative_keywords)

        raw_score += 0.18 * _signal_from_matches(any_hits, saturation=max(1, len(category.keywords_any)))
        if category.keywords_all:
            raw_score += 0.18 if len(all_hits) == len(category.keywords_all) else 0.0
        raw_score -= 0.12 * _signal_from_matches(negative_hits, saturation=max(1, len(category.negative_keywords)))
        raw_score += float(category.complexity_bias.get(features.complexity_label, 0.0))

        if request.requires_tools and "tools" in category.preferred_capabilities:
            raw_score += 0.12
        if request.requires_json and "structured_output" in category.preferred_capabilities:
            raw_score += 0.12
        if request.requires_vision and "vision" in category.preferred_capabilities:
            raw_score += 0.12

        score = _clamp(raw_score)
        results.append(
            CategoryScore(
                category_id=category.id,
                score=round(score, 4),
                normalized_score=0.0,
                matched_any_keywords=any_hits,
                matched_all_keywords=all_hits,
                matched_negative_keywords=negative_hits,
                explanation=_build_category_explanation(category, features, any_hits, all_hits, negative_hits, score),
            )
        )

    results.sort(key=lambda item: item.score, reverse=True)
    total = sum(item.score for item in results)
    for item in results:
        item.normalized_score = round((item.score / total), 4) if total > 0 else 0.0
    return results


def _score_models(
    request: RoutingRequest,
    features: PromptFeatures,
    registry: RouterRegistry,
    category_id: str,
) -> list[ModelScore]:
    category = registry.categories[category_id]
    denied_models = set(request.denied_models or [])
    allowed_providers = set(request.allowed_providers or [])
    results: list[ModelScore] = []
    for model in registry.models.values():
        gating_reasons: list[str] = []
        if model.id in denied_models:
            gating_reasons.append("model_denied")
        if category_id not in model.categories:
            gating_reasons.append("not_in_category")
        if allowed_providers and model.provider not in allowed_providers:
            gating_reasons.append("provider_not_allowed")
        if request.requires_tools and "tools" not in model.capabilities:
            gating_reasons.append("missing_tools")
        if request.requires_json and "structured_output" not in model.capabilities:
            gating_reasons.append("missing_structured_output")
        if request.requires_vision and "vision" not in model.capabilities:
            gating_reasons.append("missing_vision")
        if features.estimated_input_tokens > model.max_context_tokens > 0:
            gating_reasons.append("context_too_small")
        if any(cap in model.capabilities for cap in category.disallowed_capabilities):
            gating_reasons.append("category_disallowed_capability")
        if gating_reasons:
            continue

        raw_score = 0.0
        trait_weights = dict(category.model_trait_weights)
        if features.complexity_label == "high":
            trait_weights["quality"] = trait_weights.get("quality", 0.0) + 0.08
            trait_weights["reasoning"] = trait_weights.get("reasoning", 0.0) + 0.08
        elif features.complexity_label == "low":
            trait_weights["speed"] = trait_weights.get("speed", 0.0) + 0.08
            trait_weights["cost"] = trait_weights.get("cost", 0.0) + 0.08

        if request.max_latency_tier == "fast":
            trait_weights["speed"] = trait_weights.get("speed", 0.0) + 0.12
        if request.requires_json:
            trait_weights["structured_output"] = trait_weights.get("structured_output", 0.0) + 0.12
        if features.long_context_signal > 0.6:
            trait_weights["long_context"] = trait_weights.get("long_context", 0.0) + 0.10
        if features.safety_signal > 0.4:
            trait_weights["reliability"] = trait_weights.get("reliability", 0.0) + 0.10

        for trait, weight in trait_weights.items():
            raw_score += float(model.traits.get(trait, 0.0)) * float(weight)
        raw_score += 0.03 * _capability_match_bonus(model.capabilities, category.preferred_capabilities)

        results.append(
            ModelScore(
                model_id=model.id,
                score=round(_clamp(raw_score), 4),
                gating_reasons=gating_reasons,
                explanation=_build_model_explanation(model, category_id, features, raw_score),
            )
        )
    results.sort(key=lambda item: item.score, reverse=True)
    return results


def _build_category_explanation(
    category: CategoryDefinition,
    features: PromptFeatures,
    any_hits: list[str],
    all_hits: list[str],
    negative_hits: list[str],
    score: float,
) -> str:
    strongest = sorted(
        [
            ("code", features.code_signal),
            ("reasoning", features.reasoning_signal),
            ("translation", features.translation_signal),
            ("summarization", features.summarization_signal),
            ("extraction", features.extraction_signal),
            ("classification", features.classification_signal),
            ("structured", features.structured_output_signal),
        ],
        key=lambda item: item[1],
        reverse=True,
    )[:3]
    strongest_text = ", ".join(f"{name}={value:.2f}" for name, value in strongest if value > 0)
    keyword_bits: list[str] = []
    if any_hits:
        keyword_bits.append(f"matched_any={any_hits}")
    if all_hits:
        keyword_bits.append(f"matched_all={all_hits}")
    if negative_hits:
        keyword_bits.append(f"negative={negative_hits}")
    keyword_text = "; ".join(keyword_bits) if keyword_bits else "no category-specific keyword hits"
    return (
        f"{category.id} scored {score:.3f} from signals [{strongest_text or 'none'}], "
        f"complexity={features.complexity_label}, {keyword_text}."
    )


def _build_model_explanation(
    model: ModelDefinition,
    category_id: str,
    features: PromptFeatures,
    raw_score: float,
) -> str:
    best_traits = sorted(model.traits.items(), key=lambda item: item[1], reverse=True)[:4]
    trait_text = ", ".join(f"{name}={value:.2f}" for name, value in best_traits)
    return (
        f"{model.id} in category {category_id} scored {_clamp(raw_score):.3f}; "
        f"top traits [{trait_text}], complexity={features.complexity_label}, "
        f"context={model.max_context_tokens}."
    )


def _match_patterns(text: str, patterns: list[str]) -> list[str]:
    hits: list[str] = []
    for pattern in patterns:
        escaped = re.escape(pattern.lower()).replace("\\ ", "\\s+")
        if re.search(rf"\b{escaped}\b", text):
            hits.append(pattern)
    return hits


def _signal_from_matches(matches: list[str], saturation: int) -> float:
    if not matches:
        return 0.0
    return round(min(1.0, len(matches) / max(1, saturation)), 4)


def _normalize(value: float, lower: float, upper: float) -> float:
    if upper <= lower:
        return 0.0
    return _clamp((value - lower) / (upper - lower))


def _complexity_label(score: float, medium_threshold: float, high_threshold: float) -> str:
    if score >= high_threshold:
        return "high"
    if score >= medium_threshold:
        return "medium"
    return "low"


def _capability_match_bonus(model_capabilities: list[str], preferred_capabilities: list[str]) -> float:
    if not preferred_capabilities:
        return 0.0
    matches = len([cap for cap in preferred_capabilities if cap in model_capabilities])
    return matches / len(preferred_capabilities)


def _confidence_from_scores(scores: list[CategoryScore]) -> float:
    if not scores:
        return 0.0
    if len(scores) == 1:
        return 1.0
    margin = max(0.0, scores[0].score - scores[1].score)
    return round(_clamp(0.5 + margin), 4)


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))
