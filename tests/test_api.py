"""Tests for chat completions API endpoint."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_chat_completions_endpoint_exists(client):
    """Test that /v1/chat/completions endpoint exists."""
    # Will fail until we implement, but won't call real LLM
    response = client.post(
        "/v1/chat/completions", json={"messages": [{"role": "user", "content": "test"}]}
    )
    # Expect 500 or other error (no real API key), but not 404
    assert response.status_code != 404


@pytest.mark.asyncio
async def test_chat_completions_with_mock(client):
    """Test chat completions with mocked LiteLLM."""
    mock_response = MagicMock()
    mock_response.id = "chatcmpl-test123"
    mock_response.created = 1234567890
    mock_response.model = "gpt-4o-mini"
    mock_response.usage.prompt_tokens = 10
    mock_response.usage.completion_tokens = 5
    mock_response.usage.total_tokens = 15

    mock_choice = MagicMock()
    mock_choice.index = 0
    mock_choice.message.role = "assistant"
    mock_choice.message.content = "Hello!"
    mock_choice.finish_reason = "stop"
    mock_response.choices = [mock_choice]

    with patch(
        "frugal_code.api.chat.acompletion", new_callable=AsyncMock, return_value=mock_response
    ):
        response = client.post(
            "/v1/chat/completions",
            json={
                "messages": [{"role": "user", "content": "Hi"}],
                "model": "gpt-4o-mini",
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "chatcmpl-test123"
    assert data["choices"][0]["message"]["content"] == "Hello!"
    assert data["usage"]["total_tokens"] == 15


@pytest.mark.asyncio
async def test_chat_completions_routes_when_no_model(client):
    """Test that omitting model routes via classifier."""
    with patch("frugal_code.api.chat.acompletion", new_callable=AsyncMock) as mock_completion:
        mock_response = MagicMock()
        mock_response.id = "test"
        mock_response.created = 123
        mock_response.model = "ollama/glm-4.7-flash"
        mock_response.usage.prompt_tokens = 1
        mock_response.usage.completion_tokens = 1
        mock_response.usage.total_tokens = 2
        mock_choice = MagicMock()
        mock_choice.index = 0
        mock_choice.message.role = "assistant"
        mock_choice.message.content = "Hi"
        mock_choice.finish_reason = "stop"
        mock_response.choices = [mock_choice]
        mock_completion.return_value = mock_response

        client.post(
            "/v1/chat/completions", json={"messages": [{"role": "user", "content": "test"}]}
        )

        # Verify acompletion was called with a routed model (not None)
        assert mock_completion.called
        call_kwargs = mock_completion.call_args.kwargs
        assert call_kwargs["model"] is not None


@pytest.mark.asyncio
async def test_chat_completions_invalid_request(client):
    """Test that invalid requests return 422."""
    # Empty messages
    response = client.post("/v1/chat/completions", json={"messages": []})
    assert response.status_code == 422

    # Missing messages field
    response = client.post("/v1/chat/completions", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_chat_completions_handles_llm_error(client):
    """Test that LLM errors return 500."""
    with patch(
        "frugal_code.api.chat.acompletion",
        new_callable=AsyncMock,
        side_effect=Exception("LLM error"),
    ):
        response = client.post(
            "/v1/chat/completions", json={"messages": [{"role": "user", "content": "test"}]}
        )

    assert response.status_code == 500
    assert "error" in response.json()["detail"].lower()
