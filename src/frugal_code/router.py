"""Model selection router."""

import random

from .classifier.base import ClassificationResult
from .config import ComplexityTier, ModelConfig, settings
from .models import ChatCompletionRequest


class ModelRouter:
    """
    Routes requests to models based on complexity tier.

    Supports:
    - Tier-based routing (simple → cheap, complex → powerful)
    - Client model override (respect explicit model requests)
    - Priority-based selection when multiple models available
    """

    def __init__(self):
        """Initialize the router with settings."""
        self.model_tiers = settings.model_tiers

    def select_model(
        self,
        classification: ClassificationResult | None,
        request: ChatCompletionRequest,
    ) -> tuple[str, str, ModelConfig | None]:
        """
        Select the appropriate model.

        Args:
            classification: Classification result (or None if override requested)
            request: Original request

        Returns:
            Tuple of (model_name, reason, model_config_or_none)
        """
        # Client explicitly requested a model?
        if request.model:
            return (request.model, f"Client requested: {request.model}", None)

        # No classification? Default to complex tier (safe fallback)
        if classification is None:
            classification_tier = ComplexityTier.COMPLEX
            reason = "No classification (defaulting to complex tier)"
        else:
            classification_tier = classification.tier
            reason = (
                f"Classified as {classification_tier.value} (score: {classification.score:.2f})"
            )

        # Get models for tier
        available_models = self.model_tiers.get(classification_tier, [])

        if not available_models:
            # Fallback: try complex tier, then simple
            if classification_tier != ComplexityTier.COMPLEX:
                available_models = self.model_tiers.get(ComplexityTier.COMPLEX, [])
            if not available_models:
                available_models = self.model_tiers.get(ComplexityTier.SIMPLE, [])

        if not available_models:
            raise ValueError(f"No models configured for tier {classification_tier.value}")

        # Sort by priority (highest first), then pick randomly among top priority
        sorted_models = sorted(available_models, key=lambda m: m.priority, reverse=True)
        top_priority = sorted_models[0].priority
        top_models = [m for m in sorted_models if m.priority == top_priority]

        selected = random.choice(top_models)

        # Format model name for LiteLLM
        model_name = self._format_model_name(selected)

        return (model_name, reason, selected)

    def _format_model_name(self, model_config: ModelConfig) -> str:
        """Format model name for LiteLLM."""
        # LiteLLM format: "provider/model" or just "model" for OpenAI
        if model_config.provider.lower() == "openai":
            return model_config.name
        else:
            return f"{model_config.provider}/{model_config.name}"

    def estimate_cost(
        self,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
    ) -> float:
        """
        Estimate cost for a request (simplified).

        Returns cost in USD cents.
        """
        # Simplified cost model (would need actual pricing table)
        costs = {
            "gpt-4o-mini": {"input": 0.015, "output": 0.06},  # per 1M tokens
            "gpt-4o": {"input": 0.25, "output": 1.0},
            "claude-haiku": {"input": 0.025, "output": 0.125},
            "claude-sonnet": {"input": 0.3, "output": 1.5},
        }

        # Extract base model name
        base_model = model.split("/")[-1]

        if base_model not in costs:
            return 0.0  # Unknown model

        pricing = costs[base_model]
        input_cost = (prompt_tokens / 1_000_000) * pricing["input"] * 100  # cents
        output_cost = (completion_tokens / 1_000_000) * pricing["output"] * 100

        return input_cost + output_cost
