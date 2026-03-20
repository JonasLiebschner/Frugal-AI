def test_default_settings_load():
    """Test that default settings load without error."""
    from frugal_code.config import ComplexityTier, settings

    assert settings.service_name == "frugal-ai"
    assert ComplexityTier.SIMPLE in settings.model_tiers
    assert ComplexityTier.COMPLEX in settings.model_tiers


def test_complexity_tier_enum():
    """Test complexity tier enum values."""
    from frugal_code.config import ComplexityTier

    assert ComplexityTier.SIMPLE.value == "simple"
    assert ComplexityTier.COMPLEX.value == "complex"
    assert len(list(ComplexityTier)) == 2  # Only 2 tiers for now


def test_model_config_validation():
    """Test ModelConfig pydantic validation."""
    from frugal_code.config import ModelConfig

    model = ModelConfig(name="gpt-4o", provider="openai")
    assert model.name == "gpt-4o"
    assert model.provider == "openai"
    assert model.priority == 1  # Default


def test_get_api_key():
    """Test API key lookup by provider."""
    from frugal_code.config import settings

    # Will return None if not set, but shouldn't raise
    key = settings.get_api_key("openai")
    assert key is None or isinstance(key, str)
