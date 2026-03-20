"""Tests for Pydantic models."""

import pytest


def test_message_creation():
    """Test Message model."""
    from frugal_code.models import Message

    msg = Message(role="user", content="Hello")
    assert msg.role == "user"
    assert msg.content == "Hello"


def test_chat_completion_request_validation():
    """Test request model validation."""
    from frugal_code.models import ChatCompletionRequest, Message

    # Valid request
    req = ChatCompletionRequest(messages=[Message(role="user", content="Test")])
    assert len(req.messages) == 1
    assert req.temperature == 1.0  # Default
    assert req.stream is False  # Default

    # Invalid: empty messages
    with pytest.raises(Exception):
        ChatCompletionRequest(messages=[])


def test_chat_completion_response_structure():
    """Test response model structure."""
    from frugal_code.models import ChatCompletionResponse, Choice, Message, Usage

    response = ChatCompletionResponse(
        id="test-123",
        created=1234567890,
        model="gpt-4o-mini",
        choices=[Choice(index=0, message=Message(role="assistant", content="Hi"))],
        usage=Usage(prompt_tokens=10, completion_tokens=20, total_tokens=30),
    )
    assert response.object == "chat.completion"
    assert response.usage.total_tokens == 30


def test_message_role_validation():
    """Test that invalid roles are rejected."""
    from frugal_code.models import Message

    # Valid roles
    Message(role="system", content="test")
    Message(role="user", content="test")
    Message(role="assistant", content="test")

    # Invalid role should fail
    with pytest.raises(Exception):
        Message(role="invalid", content="test")


def test_temperature_bounds():
    """Test temperature validation."""
    from frugal_code.models import ChatCompletionRequest, Message

    # Valid temperature
    req = ChatCompletionRequest(messages=[Message(role="user", content="test")], temperature=0.5)
    assert req.temperature == 0.5

    # Invalid: too high
    with pytest.raises(Exception):
        ChatCompletionRequest(messages=[Message(role="user", content="test")], temperature=3.0)

    # Invalid: negative
    with pytest.raises(Exception):
        ChatCompletionRequest(messages=[Message(role="user", content="test")], temperature=-0.5)
