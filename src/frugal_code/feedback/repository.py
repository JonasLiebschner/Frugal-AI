"""SQLite persistence for feedback."""

from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

from .models import (
    CREATE_INDEX_SQL,
    CREATE_TABLE_SQL,
    FeedbackRequest,
    FeedbackResponse,
)


class FeedbackRepository:
    """Repository for feedback persistence."""

    def __init__(self, db_path: str) -> None:
        """Initialize repository with database path."""
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    async def initialize(self) -> None:
        """Initialize database schema."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(CREATE_TABLE_SQL)
            await db.execute(CREATE_INDEX_SQL)
            await db.commit()

    async def create_feedback(self, feedback: FeedbackRequest) -> FeedbackResponse:
        """Store feedback in database."""
        created_at = datetime.now(timezone.utc).isoformat()

        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                """
                INSERT INTO feedback (request_id, rating, comment, complexity_override, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    feedback.request_id,
                    feedback.rating,
                    feedback.comment,
                    feedback.complexity_override.value if feedback.complexity_override else None,
                    created_at,
                ),
            )
            await db.commit()
            feedback_id = cursor.lastrowid

        return FeedbackResponse(
            id=feedback_id,
            request_id=feedback.request_id,
            rating=feedback.rating,
            comment=feedback.comment,
            complexity_override=(
                feedback.complexity_override.value if feedback.complexity_override else None
            ),
            created_at=created_at,
        )

    async def get_feedback(self, limit: int = 100, offset: int = 0) -> list[FeedbackResponse]:
        """Retrieve feedback entries with pagination."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT id, request_id, rating, comment, complexity_override, created_at
                FROM feedback
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            )
            rows = await cursor.fetchall()

        return [
            FeedbackResponse(
                id=row["id"],
                request_id=row["request_id"],
                rating=row["rating"],
                comment=row["comment"],
                complexity_override=row["complexity_override"],
                created_at=row["created_at"],
            )
            for row in rows
        ]

    async def get_feedback_by_request(self, request_id: str) -> list[FeedbackResponse]:
        """Get all feedback for a specific request."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT id, request_id, rating, comment, complexity_override, created_at
                FROM feedback
                WHERE request_id = ?
                ORDER BY created_at DESC
                """,
                (request_id,),
            )
            rows = await cursor.fetchall()

        return [
            FeedbackResponse(
                id=row["id"],
                request_id=row["request_id"],
                rating=row["rating"],
                comment=row["comment"],
                complexity_override=row["complexity_override"],
                created_at=row["created_at"],
            )
            for row in rows
        ]
