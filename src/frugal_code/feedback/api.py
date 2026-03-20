"""Feedback API endpoints."""

from fastapi import APIRouter, HTTPException

from ..config import settings
from .models import FeedbackRequest, FeedbackResponse
from .repository import FeedbackRepository

router = APIRouter(tags=["Feedback"])

feedback_repo = FeedbackRepository(settings.feedback_db_path)


@router.post(
    "/v1/feedback", response_model=FeedbackResponse, status_code=201, summary="Submit feedback"
)
async def submit_feedback(feedback: FeedbackRequest) -> FeedbackResponse:
    """Submit feedback on a chat completion response.

    Use the `id` from a chat completion response as `request_id`.
    Optionally suggest a `complexity_override` if you think the router chose the wrong tier.
    """
    try:
        return await feedback_repo.create_feedback(feedback)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store feedback: {e}")


@router.get("/v1/feedback", response_model=list[FeedbackResponse], summary="List feedback")
async def get_feedback(limit: int = 100, offset: int = 0) -> list[FeedbackResponse]:
    """Retrieve feedback entries with pagination.

    Use `limit` and `offset` query params to paginate through results.
    Results are ordered by creation date (newest first).
    """
    try:
        return await feedback_repo.get_feedback(limit=limit, offset=offset)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve feedback: {e}")


@router.get(
    "/v1/feedback/{request_id}",
    response_model=list[FeedbackResponse],
    summary="Get feedback by request",
)
async def get_feedback_for_request(request_id: str) -> list[FeedbackResponse]:
    """Get all feedback for a specific request ID.

    Returns all feedback entries associated with the given chat completion request.
    """
    try:
        return await feedback_repo.get_feedback_by_request(request_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve feedback: {e}")
