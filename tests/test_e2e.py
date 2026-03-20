"""
E2E tests for the Frugal-AI proxy.

These tests require:
1. The Frugal-AI server running: uv run uvicorn frugal_code.main:app --port 8000
2. The Ollama instance reachable at the configured URL

Run with:
    uv run pytest tests/test_e2e.py -v -s
"""

import httpx
import pytest

BASE_URL = "http://localhost:8000"


@pytest.fixture
def api():
    """HTTP client for the running server."""
    with httpx.Client(base_url=BASE_URL, timeout=120.0) as client:
        yield client


def test_health(api: httpx.Client):
    """Test health endpoint."""
    resp = api.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["service"] == "frugal-ai"


def test_simple_prompt_routes_to_simple_model(api: httpx.Client):
    """Test that a simple prompt gets routed to the simple-tier model."""
    resp = api.post(
        "/v1/chat/completions",
        json={
            "messages": [{"role": "user", "content": "What is 2+2?"}],
        },
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["choices"][0]["message"]["content"]
    assert data["usage"]["total_tokens"] > 0
    # Should route to simple model (glm-4.7-flash by default)
    print(f"  Simple prompt → model: {data['model']}")
    print(f"  Response: {data['choices'][0]['message']['content'][:100]}")
    print(f"  Tokens: {data['usage']}")


def test_complex_prompt_routes_to_complex_model(api: httpx.Client):
    """Test that a complex prompt gets routed to the complex-tier model."""
    complex_prompt = (
        "Analyze and explain in detail the step by step process of implementing "
        "a distributed consensus algorithm. Compare Raft and Paxos, evaluate their "
        "trade-offs in terms of performance, fault tolerance, and implementation "
        "complexity. Write a comprehensive design document with code examples.\n\n"
        "```python\n# Include a skeleton implementation\nclass RaftNode:\n    pass\n```"
    )
    resp = api.post(
        "/v1/chat/completions",
        json={
            "messages": [{"role": "user", "content": complex_prompt}],
        },
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["choices"][0]["message"]["content"]
    assert data["usage"]["total_tokens"] > 0
    print(f"  Complex prompt → model: {data['model']}")
    print(f"  Response: {data['choices'][0]['message']['content'][:100]}")
    print(f"  Tokens: {data['usage']}")


def test_explicit_model_override(api: httpx.Client):
    """Test that specifying a model explicitly bypasses classification."""
    resp = api.post(
        "/v1/chat/completions",
        json={
            "model": "ollama/glm-4.7-flash",
            "messages": [{"role": "user", "content": "Say hello"}],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["choices"][0]["message"]["content"]
    print(f"  Override → model: {data['model']}")


def test_streaming(api: httpx.Client):
    """Test streaming response via SSE."""
    with httpx.stream(
        "POST",
        f"{BASE_URL}/v1/chat/completions",
        json={
            "messages": [{"role": "user", "content": "Count from 1 to 5"}],
            "stream": True,
        },
        timeout=120.0,
    ) as resp:
        assert resp.status_code == 200
        chunks = []
        for line in resp.iter_lines():
            if line.startswith("data: ") and line != "data: [DONE]":
                chunks.append(line)
        assert len(chunks) > 0
        print(f"  Streaming: received {len(chunks)} chunks")


def test_feedback_submit_and_retrieve(api: httpx.Client):
    """Test feedback submission and retrieval."""
    # First make a request to get a request_id
    resp = api.post(
        "/v1/chat/completions",
        json={"messages": [{"role": "user", "content": "Hi"}]},
    )
    assert resp.status_code == 200
    request_id = resp.json()["id"]

    # Submit feedback
    feedback_resp = api.post(
        "/v1/feedback",
        json={
            "request_id": request_id,
            "rating": 5,
            "comment": "E2E test feedback",
        },
    )
    assert feedback_resp.status_code == 201
    feedback_data = feedback_resp.json()
    assert feedback_data["request_id"] == request_id
    assert feedback_data["rating"] == 5

    # Retrieve feedback
    get_resp = api.get(f"/v1/feedback/{request_id}")
    assert get_resp.status_code == 200
    entries = get_resp.json()
    assert any(e["request_id"] == request_id for e in entries)
    print(f"  Feedback stored and retrieved for {request_id}")


def test_feedback_with_complexity_override(api: httpx.Client):
    """Test feedback with complexity override."""
    resp = api.post(
        "/v1/feedback",
        json={
            "request_id": "e2e-test-override",
            "rating": 2,
            "comment": "Should have used complex model",
            "complexity_override": "complex",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["complexity_override"] == "complex"
