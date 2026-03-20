from contextlib import asynccontextmanager

from fastapi import FastAPI
from opentelemetry import trace

from .api.chat import router as chat_router
from .config import settings
from .feedback import feedback_router
from .feedback.api import feedback_repo
from .telemetry import instrument_fastapi, setup_telemetry


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    # Startup
    print(f"🚀 Starting {settings.service_name} on {settings.host}:{settings.port}")

    # Initialize OpenTelemetry
    setup_telemetry()

    # Initialize feedback database
    await feedback_repo.initialize()
    print(f"✅ Feedback database initialized: {settings.feedback_db_path}")

    yield

    # Shutdown
    if settings.otel_enabled:
        provider = trace.get_tracer_provider()
        if hasattr(provider, "shutdown"):
            provider.shutdown()
    print("👋 Shutting down...")


app = FastAPI(
    title="Frugal-AI",
    description=(
        "Complexity-aware LLM proxy that classifies prompt complexity and routes "
        "to the most cost-effective model. OpenAI-compatible API."
    ),
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "Chat", "description": "OpenAI-compatible chat completions with smart routing"},
        {"name": "Feedback", "description": "Rate responses and suggest complexity overrides"},
        {"name": "Health", "description": "Service health checks"},
    ],
)

# Instrument FastAPI for auto-tracing
instrument_fastapi(app)

# Register routers
app.include_router(chat_router)
app.include_router(feedback_router)


@app.get("/health", tags=["Health"])
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": settings.service_name,
        "version": "0.1.0",
    }
