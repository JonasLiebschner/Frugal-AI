"""End-to-end integration tests."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_full_pipeline_simple_request(client):
    """Test full pipeline: classify → route → call LLM for simple request."""
    mock_response = MagicMock()
    mock_response.id = "test-123"
    mock_response.created = 123456
    mock_response.model = "gpt-4o-mini"
    mock_response.usage.prompt_tokens = 5
    mock_response.usage.completion_tokens = 3
    mock_response.usage.total_tokens = 8
    mock_choice = MagicMock()
    mock_choice.index = 0
    mock_choice.message.role = "assistant"
    mock_choice.message.content = "Hi"
    mock_choice.finish_reason = "stop"
    mock_response.choices = [mock_choice]

    with patch(
        "frugal_code.api.chat.acompletion", new_callable=AsyncMock, return_value=mock_response
    ):
        response = client.post(
            "/v1/chat/completions", json={"messages": [{"role": "user", "content": "What is 2+2?"}]}
        )

    assert response.status_code == 200
    data = response.json()
    # Should have routed to simple model
    assert "mini" in data["model"].lower() or "haiku" in data["model"].lower()


@pytest.mark.asyncio
async def test_full_pipeline_complex_request(client):
    """Test full pipeline for complex request."""
    mock_response = MagicMock()
    mock_response.id = "test-456"
    mock_response.created = 123456
    mock_response.model = "gpt-4o"
    mock_response.usage.prompt_tokens = 100
    mock_response.usage.completion_tokens = 50
    mock_response.usage.total_tokens = 150
    mock_choice = MagicMock()
    mock_choice.index = 0
    mock_choice.message.role = "assistant"
    mock_choice.message.content = "Detailed analysis..."
    mock_choice.finish_reason = "stop"
    mock_response.choices = [mock_choice]

    long_prompt = "Analyze and explain in detail the comprehensive architecture " * 20

    with patch(
        "frugal_code.api.chat.acompletion", new_callable=AsyncMock, return_value=mock_response
    ):
        response = client.post(
            "/v1/chat/completions", json={"messages": [{"role": "user", "content": long_prompt}]}
        )

    assert response.status_code == 200
    # Should have routed to complex model
