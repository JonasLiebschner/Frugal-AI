from enum import Enum
from typing import Dict, List

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ComplexityTier(str, Enum):
    """Complexity tier enum - extensible design."""

    SIMPLE = "simple"
    COMPLEX = "complex"
    # Future: MEDIUM = "medium"


class ModelConfig(BaseModel):
    """Configuration for a single model."""

    name: str = Field(..., description="Model name (e.g., 'gpt-4o-mini')")
    provider: str = Field(..., description="Provider (openai, anthropic, ollama, etc.)")
    base_url: str | None = Field(None, description="Custom base URL for provider")
    api_key: str | None = Field(None, description="API key (or use global)")
    priority: int = Field(1, description="Selection priority (higher = preferred)")


class Settings(BaseSettings):
    """Application settings loaded from environment and .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
    )

    # Service
    service_name: str = Field("frugal-ai", description="Service name for telemetry")
    host: str = Field("0.0.0.0", description="Server host")
    port: int = Field(8000, description="Server port")

    # Ollama
    ollama_base_url: str | None = None

    # Model Tiers - JSON structure in env: MODEL_TIERS='{"simple": [...], "complex": [...]}'
    model_tiers: Dict[ComplexityTier, List[ModelConfig]] = Field(
        default_factory=lambda: {
            ComplexityTier.SIMPLE: [
                ModelConfig(
                    name="glm-4.7-flash",
                    provider="ollama",
                    base_url="http://172.26.32.29:11434",
                    priority=1,
                ),
            ],
            ComplexityTier.COMPLEX: [
                ModelConfig(
                    name="qwen3.5:35b",
                    provider="ollama",
                    base_url="http://172.26.32.29:11434",
                    priority=1,
                ),
            ],
        },
        description="Model tier mappings",
    )

    # Default provider credentials (can be overridden per-model)
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None

    # Telemetry
    otel_exporter_otlp_endpoint: str = Field(
        "http://localhost:4317",
        description="OTLP endpoint for traces",
    )
    otel_enabled: bool = Field(True, description="Enable OpenTelemetry")

    # Feedback storage
    feedback_db_path: str = Field("data/feedback.db", description="SQLite DB path")

    def get_api_key(self, provider: str) -> str | None:
        """Get API key for a provider."""
        key_map = {
            "openai": self.openai_api_key,
            "anthropic": self.anthropic_api_key,
        }
        return key_map.get(provider.lower())


# Singleton instance
settings = Settings()
