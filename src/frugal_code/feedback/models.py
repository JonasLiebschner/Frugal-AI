"""Feedback data models."""

from typing import Optional

from pydantic import BaseModel, Field

from ..config import ComplexityTier


class FeedbackRequest(BaseModel):
    """User feedback on a chat completion response."""

    request_id: str = Field(..., description="ID of the completion request")
    rating: int = Field(..., ge=1, le=5, description="Rating 1-5")
    comment: Optional[str] = Field(None, description="Optional feedback comment")
    complexity_override: Optional[ComplexityTier] = Field(
        None,
        description="User's opinion on correct complexity tier",
    )


class FeedbackResponse(BaseModel):
    """Feedback record with metadata."""

    id: int
    request_id: str
    rating: int
    comment: Optional[str]
    complexity_override: Optional[str]
    created_at: str


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    complexity_override TEXT,
    created_at TEXT NOT NULL
)
"""

CREATE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_request_id ON feedback(request_id);
"""
