def test_health_endpoint(client):
    """Test health check endpoint returns 200."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "frugal-ai"
    assert "version" in data


def test_app_title():
    """Test app metadata."""
    from frugal_code.main import app

    assert app.title == "Frugal-AI"
    assert app.version == "0.1.0"
