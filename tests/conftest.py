import pytest
from fastapi.testclient import TestClient

from frugal_code.config import settings
from frugal_code.main import app


@pytest.fixture
def client(tmp_path):
    """FastAPI test client with initialized feedback DB."""
    from frugal_code.feedback.api import feedback_repo

    original_db_path = feedback_repo.db_path
    feedback_repo.db_path = str(tmp_path / "test_feedback.db")

    with TestClient(app) as c:
        yield c

    feedback_repo.db_path = original_db_path


@pytest.fixture
def mock_settings():
    """Mock settings for testing."""
    return settings
