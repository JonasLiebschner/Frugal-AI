"""OpenTelemetry initialization and tracing helpers."""

from contextlib import contextmanager
from typing import TYPE_CHECKING, Any

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import Status, StatusCode

from .config import settings

if TYPE_CHECKING:
    from .classifier.base import ClassificationResult


def setup_telemetry() -> None:
    """Initialize OpenTelemetry tracing with OTLP exporter."""
    if not settings.otel_enabled:
        print("⚠️  OpenTelemetry disabled")
        return

    resource = Resource(
        attributes={
            "service.name": settings.service_name,
        }
    )

    provider = TracerProvider(resource=resource)

    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

    otlp_exporter = OTLPSpanExporter(
        endpoint=settings.otel_exporter_otlp_endpoint,
        insecure=True,
    )
    provider.add_span_processor(BatchSpanProcessor(otlp_exporter))

    trace.set_tracer_provider(provider)
    print(f"✅ OpenTelemetry initialized: {settings.otel_exporter_otlp_endpoint}")


def instrument_fastapi(app: Any) -> None:
    """Instrument FastAPI app for auto-tracing."""
    if not settings.otel_enabled:
        return

    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

    FastAPIInstrumentor.instrument_app(app)
    print("✅ FastAPI instrumented")


tracer = trace.get_tracer("frugal_code")


@contextmanager
def trace_classification():
    """Context manager for classification span."""
    with tracer.start_as_current_span("frugal.classify") as span:
        try:
            yield span
        except Exception as e:
            span.set_status(Status(StatusCode.ERROR, str(e)))
            span.record_exception(e)
            raise


@contextmanager
def trace_completion(model: str):
    """Context manager for completion span with GenAI semconv."""
    with tracer.start_as_current_span("gen_ai.chat") as span:
        span.set_attribute("gen_ai.system", model.split("/")[0] if "/" in model else "openai")
        span.set_attribute("gen_ai.request.model", model)
        try:
            yield span
        except Exception as e:
            span.set_status(Status(StatusCode.ERROR, str(e)))
            span.record_exception(e)
            raise


def add_classification_attributes(span: Any, classification: "ClassificationResult") -> None:
    """Add Frugal-AI classification attributes to span."""
    span.set_attribute("frugal.complexity_tier", classification.tier.value)
    span.set_attribute("frugal.complexity_score", classification.score)
    span.set_attribute("frugal.classifier_type", classification.classifier_type)
    span.set_attribute("frugal.classification_reason", classification.reason)


def add_completion_attributes(
    span: Any,
    model: str,
    usage: Any,
    estimated_cost: float,
    estimated_savings: float,
) -> None:
    """Add GenAI semconv and Frugal attributes to completion span."""
    span.set_attribute("gen_ai.response.model", model)
    span.set_attribute("gen_ai.usage.input_tokens", usage.prompt_tokens)
    span.set_attribute("gen_ai.usage.output_tokens", usage.completion_tokens)
    span.set_attribute("frugal.routed_model", model)
    span.set_attribute("frugal.estimated_cost_cents", round(estimated_cost, 4))
    span.set_attribute("frugal.estimated_savings_cents", round(estimated_savings, 4))
