"""Tests for complexity classifier."""

import pytest

from frugal_code.classifier import ClassificationResult, HeuristicClassifier
from frugal_code.config import ComplexityTier
from frugal_code.models import ChatCompletionRequest, Message


@pytest.mark.asyncio
async def test_simple_short_question():
    """Test that a short, simple question is classified as SIMPLE."""
    classifier = HeuristicClassifier()
    request = ChatCompletionRequest(
        messages=[Message(role="user", content="What is the capital of France?")]
    )
    result = await classifier.classify(request)

    assert result.tier == ComplexityTier.SIMPLE
    assert result.score < 0.5
    assert result.classifier_type == "heuristic"


@pytest.mark.asyncio
async def test_complex_long_prompt():
    """Test that a long, detailed prompt is classified as COMPLEX."""
    classifier = HeuristicClassifier()
    long_content = (
        "Analyze and compare the architectural differences "
        "between microservices and monolithic applications. " * 30
    )
    request = ChatCompletionRequest(messages=[Message(role="user", content=long_content)])
    result = await classifier.classify(request)

    assert result.tier == ComplexityTier.COMPLEX
    assert result.score >= 0.5
    assert "tokens" in result.reason.lower()


@pytest.mark.asyncio
async def test_code_block_increases_complexity():
    """Test that code blocks increase complexity score."""
    classifier = HeuristicClassifier()
    request = ChatCompletionRequest(
        messages=[
            Message(role="user", content="Fix this code:\n```python\ndef broken(): pass\n```")
        ]
    )
    result = await classifier.classify(request)

    assert "code" in result.reason.lower()
    # Code alone might not push to COMPLEX, but should increase score
    assert result.score > 0.0


@pytest.mark.asyncio
async def test_complex_keywords():
    """Test that complexity keywords increase score."""
    classifier = HeuristicClassifier()
    request = ChatCompletionRequest(
        messages=[
            Message(role="user", content="Analyze and explain in detail the step by step process")
        ]
    )
    result = await classifier.classify(request)

    assert "keyword" in result.reason.lower()
    assert result.score > 0.0


@pytest.mark.asyncio
async def test_long_conversation():
    """Test that long conversations are classified as COMPLEX."""
    classifier = HeuristicClassifier()
    messages = []
    for i in range(6):
        messages.append(Message(role="user" if i % 2 == 0 else "assistant", content=f"Message {i}"))

    request = ChatCompletionRequest(messages=messages)
    result = await classifier.classify(request)

    assert "turns" in result.reason.lower() or "conversation" in result.reason.lower()
    assert result.score > 0.0


@pytest.mark.asyncio
async def test_simple_keywords_reduce_score():
    """Test that simple keywords can keep score low."""
    classifier = HeuristicClassifier()
    request = ChatCompletionRequest(
        messages=[Message(role="user", content="What is a list? Simple definition please.")]
    )
    result = await classifier.classify(request)

    # Should still be simple
    assert result.tier == ComplexityTier.SIMPLE


@pytest.mark.asyncio
async def test_classification_result_structure():
    """Test ClassificationResult dataclass."""
    result = ClassificationResult(
        tier=ComplexityTier.SIMPLE,
        score=0.3,
        reason="Test reason",
        classifier_type="test",
    )

    assert result.tier == ComplexityTier.SIMPLE
    assert result.score == 0.3
    assert result.reason == "Test reason"
    assert result.classifier_type == "test"
