"""Tests for feedback system."""

import pytest

from frugal_code.config import ComplexityTier
from frugal_code.feedback.models import FeedbackRequest
from frugal_code.feedback.repository import FeedbackRepository


@pytest.fixture
async def feedback_repo(tmp_path):
    """Create a test feedback repository."""
    db_path = str(tmp_path / "test_feedback.db")
    repo = FeedbackRepository(db_path)
    await repo.initialize()
    return repo


@pytest.mark.asyncio
async def test_create_feedback(feedback_repo):
    """Test creating feedback entry."""
    feedback = FeedbackRequest(
        request_id="test-123",
        rating=5,
        comment="Great response!",
        complexity_override=ComplexityTier.SIMPLE,
    )

    result = await feedback_repo.create_feedback(feedback)

    assert result.id > 0
    assert result.request_id == "test-123"
    assert result.rating == 5
    assert result.comment == "Great response!"
    assert result.complexity_override == "simple"
    assert result.created_at is not None


@pytest.mark.asyncio
async def test_get_feedback(feedback_repo):
    """Test retrieving feedback entries."""
    for i in range(3):
        await feedback_repo.create_feedback(FeedbackRequest(request_id=f"req-{i}", rating=i + 1))

    results = await feedback_repo.get_feedback(limit=10)

    assert len(results) == 3
    # Should be ordered by created_at DESC
    assert results[0].request_id == "req-2"


@pytest.mark.asyncio
async def test_get_feedback_by_request(feedback_repo):
    """Test retrieving feedback for specific request."""
    await feedback_repo.create_feedback(FeedbackRequest(request_id="req-1", rating=4))
    await feedback_repo.create_feedback(FeedbackRequest(request_id="req-1", rating=5))
    await feedback_repo.create_feedback(FeedbackRequest(request_id="req-2", rating=3))

    results = await feedback_repo.get_feedback_by_request("req-1")

    assert len(results) == 2
    assert all(r.request_id == "req-1" for r in results)


@pytest.mark.asyncio
async def test_feedback_pagination(feedback_repo):
    """Test feedback pagination."""
    for i in range(5):
        await feedback_repo.create_feedback(FeedbackRequest(request_id=f"req-{i}", rating=3))

    page1 = await feedback_repo.get_feedback(limit=2, offset=0)
    page2 = await feedback_repo.get_feedback(limit=2, offset=2)

    assert len(page1) == 2
    assert len(page2) == 2
    assert page1[0].id != page2[0].id


def test_feedback_validation():
    """Test feedback request validation."""
    from pydantic import ValidationError

    # Valid
    valid = FeedbackRequest(request_id="test", rating=3)
    assert valid.rating == 3

    # Invalid rating too high
    with pytest.raises(ValidationError):
        FeedbackRequest(request_id="test", rating=6)

    # Invalid rating too low
    with pytest.raises(ValidationError):
        FeedbackRequest(request_id="test", rating=0)


def test_feedback_api_submit(client):
    """Test POST /v1/feedback endpoint."""
    response = client.post(
        "/v1/feedback",
        json={
            "request_id": "chatcmpl-test123",
            "rating": 5,
            "comment": "Excellent!",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["request_id"] == "chatcmpl-test123"
    assert data["rating"] == 5
    assert data["comment"] == "Excellent!"
    assert "id" in data
    assert "created_at" in data


def test_feedback_api_get(client):
    """Test GET /v1/feedback endpoint."""
    client.post("/v1/feedback", json={"request_id": "test1", "rating": 4})
    client.post("/v1/feedback", json={"request_id": "test2", "rating": 5})

    response = client.get("/v1/feedback")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 2


def test_feedback_api_get_by_request(client):
    """Test GET /v1/feedback/{request_id} endpoint."""
    client.post("/v1/feedback", json={"request_id": "specific-123", "rating": 3})

    response = client.get("/v1/feedback/specific-123")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["request_id"] == "specific-123"


def test_feedback_with_complexity_override(client):
    """Test feedback with complexity override."""
    response = client.post(
        "/v1/feedback",
        json={
            "request_id": "override-test",
            "rating": 2,
            "comment": "Should have used a better model",
            "complexity_override": "complex",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["complexity_override"] == "complex"
