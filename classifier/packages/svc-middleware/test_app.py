from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient


PACKAGE_ROOT = Path(__file__).resolve().parent
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

from classifier import Settings  # noqa: E402
from index import create_app  # noqa: E402


PACKAGE_ROOT = Path(__file__).resolve().parent


def build_settings() -> Settings:
    return Settings(
        host="127.0.0.1",
        port=3004,
        mapping_path=PACKAGE_ROOT / "config" / "svc_middleware_mapping.website_connections.json",
        model_path_override=None,
        enable_debug_endpoints=True,
    )


def test_health_and_ready() -> None:
    app = create_app(build_settings())
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/ready").status_code == 200


def test_classify_returns_model_only() -> None:
    app = create_app(build_settings())
    with TestClient(app) as client:
        response = client.post("/api/v1/classify", json={"query": "Debug this FastAPI endpoint and explain the safest fix."})
        assert response.status_code == 200
        payload = response.json()
        assert set(payload.keys()) == {"model"}
        assert isinstance(payload["model"], str)
        assert payload["model"]


def test_debug_endpoint_exposes_internal_metadata() -> None:
    app = create_app(build_settings())
    with TestClient(app) as client:
        response = client.post("/api/v1/classify/debug", json={"query": "Summarize this short text faithfully."})
        assert response.status_code == 200
        payload = response.json()
        assert "model" in payload
        assert "additionalData" in payload
        classification = payload["additionalData"]["classification"]
        assert "criteria" in classification
        assert "hardness_band" in classification
        assert "weighted_escalation_class" in classification
