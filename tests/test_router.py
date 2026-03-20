"""Tests for model router."""

from frugal_code.classifier.base import ClassificationResult
from frugal_code.config import ComplexityTier
from frugal_code.models import ChatCompletionRequest, Message
from frugal_code.router import ModelRouter


def test_router_selects_simple_model():
    """Test router selects simple tier model for SIMPLE classification."""
    router = ModelRouter()
    classification = ClassificationResult(
        tier=ComplexityTier.SIMPLE,
        score=0.3,
        reason="Simple test",
        classifier_type="test",
    )
    request = ChatCompletionRequest(messages=[Message(role="user", content="test")])

    model, reason, model_config = router.select_model(classification, request)

    # Should select from simple tier (ollama glm-4.7-flash by default)
    assert model is not None
    assert "simple" in reason.lower()
    assert model_config is not None


def test_router_selects_complex_model():
    """Test router selects complex tier model for COMPLEX classification."""
    router = ModelRouter()
    classification = ClassificationResult(
        tier=ComplexityTier.COMPLEX,
        score=0.8,
        reason="Complex test",
        classifier_type="test",
    )
    request = ChatCompletionRequest(messages=[Message(role="user", content="test")])

    model, reason, model_config = router.select_model(classification, request)

    # Should select from complex tier (ollama qwen3.5:35b by default)
    assert model is not None
    assert "complex" in reason.lower()
    assert model_config is not None


def test_router_respects_client_model_override():
    """Test router respects explicit model request from client."""
    router = ModelRouter()
    classification = ClassificationResult(
        tier=ComplexityTier.SIMPLE,
        score=0.2,
        reason="Simple",
        classifier_type="test",
    )
    request = ChatCompletionRequest(
        model="gpt-4o",  # Client wants expensive model
        messages=[Message(role="user", content="test")],
    )

    model, reason, model_config = router.select_model(classification, request)

    # Should use client's requested model
    assert model == "gpt-4o"
    assert "requested" in reason.lower()
    assert model_config is None  # No config for client overrides


def test_router_handles_no_classification():
    """Test router defaults to complex tier if no classification."""
    router = ModelRouter()
    request = ChatCompletionRequest(messages=[Message(role="user", content="test")])

    model, reason, model_config = router.select_model(None, request)

    # Should default to complex tier (safe fallback)
    assert model is not None
    assert "default" in reason.lower() or "no classification" in reason.lower()


def test_cost_estimation():
    """Test cost estimation for known models."""
    router = ModelRouter()

    # gpt-4o-mini should be cheaper than gpt-4o
    mini_cost = router.estimate_cost("gpt-4o-mini", 1000, 500)
    standard_cost = router.estimate_cost("gpt-4o", 1000, 500)

    assert mini_cost > 0
    assert standard_cost > mini_cost


def test_format_model_name():
    """Test model name formatting for LiteLLM."""
    from frugal_code.config import ModelConfig

    router = ModelRouter()

    # OpenAI model - no prefix
    openai_model = ModelConfig(name="gpt-4o", provider="openai")
    assert router._format_model_name(openai_model) == "gpt-4o"

    # Anthropic model - with prefix
    anthropic_model = ModelConfig(name="claude-3-sonnet", provider="anthropic")
    assert router._format_model_name(anthropic_model) == "anthropic/claude-3-sonnet"
