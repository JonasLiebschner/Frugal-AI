"""Tests for OpenTelemetry instrumentation."""

from unittest.mock import MagicMock, patch

from frugal_code.classifier.base import ClassificationResult
from frugal_code.config import ComplexityTier
from frugal_code.telemetry import (
    add_classification_attributes,
    add_completion_attributes,
    trace_classification,
    trace_completion,
)


def test_setup_telemetry_when_disabled():
    """Test OTel setup does nothing when disabled."""
    with patch("frugal_code.telemetry.settings") as mock_settings:
        mock_settings.otel_enabled = False
        from frugal_code.telemetry import setup_telemetry

        setup_telemetry()  # Should not raise


def test_trace_classification_context_manager():
    """Test classification span context manager creates span."""
    with trace_classification() as span:
        assert span is not None


def test_trace_completion_context_manager():
    """Test completion span context manager creates span with attributes."""
    with trace_completion("gpt-4o-mini") as span:
        assert span is not None


def test_add_classification_attributes():
    """Test adding classification attributes to span."""
    mock_span = MagicMock()
    classification = ClassificationResult(
        tier=ComplexityTier.SIMPLE,
        score=0.3,
        reason="Test reason",
        classifier_type="heuristic",
    )

    add_classification_attributes(mock_span, classification)

    mock_span.set_attribute.assert_any_call("frugal.complexity_tier", "simple")
    mock_span.set_attribute.assert_any_call("frugal.complexity_score", 0.3)
    mock_span.set_attribute.assert_any_call("frugal.classifier_type", "heuristic")
    mock_span.set_attribute.assert_any_call("frugal.classification_reason", "Test reason")
    assert mock_span.set_attribute.call_count == 4


def test_add_completion_attributes():
    """Test adding GenAI semconv and Frugal attributes to span."""
    mock_span = MagicMock()
    mock_usage = MagicMock()
    mock_usage.prompt_tokens = 100
    mock_usage.completion_tokens = 50

    add_completion_attributes(
        span=mock_span,
        model="gpt-4o-mini",
        usage=mock_usage,
        estimated_cost=0.05,
        estimated_savings=0.10,
    )

    mock_span.set_attribute.assert_any_call("gen_ai.response.model", "gpt-4o-mini")
    mock_span.set_attribute.assert_any_call("gen_ai.usage.input_tokens", 100)
    mock_span.set_attribute.assert_any_call("gen_ai.usage.output_tokens", 50)
    mock_span.set_attribute.assert_any_call("frugal.routed_model", "gpt-4o-mini")
    mock_span.set_attribute.assert_any_call("frugal.estimated_cost_cents", 0.05)
    mock_span.set_attribute.assert_any_call("frugal.estimated_savings_cents", 0.1)
    assert mock_span.set_attribute.call_count == 6
