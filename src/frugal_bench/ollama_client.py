from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


class OllamaError(RuntimeError):
    """Raised when the Ollama API returns an error."""


@dataclass
class OllamaResponse:
    response_text: str
    raw: dict[str, Any]
    latency_seconds: float


class OllamaClient:
    def __init__(self, base_url: str, timeout_seconds: int = 120) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def list_models(self) -> list[str]:
        payload = self._request_json("/api/tags", None)
        return [item["model"] for item in payload.get("models", [])]

    def generate(
        self,
        model: str,
        prompt: str,
        system: str | None = None,
        temperature: float = 0.0,
        num_predict: int | None = None,
    ) -> OllamaResponse:
        body: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
            },
        }
        if system:
            body["system"] = system
        if num_predict is not None:
            body["options"]["num_predict"] = num_predict

        started = time.perf_counter()
        payload = self._request_json("/api/generate", body)
        latency = time.perf_counter() - started
        return OllamaResponse(
            response_text=payload.get("response", ""),
            raw=payload,
            latency_seconds=latency,
        )

    def _request_json(self, path: str, body: dict[str, Any] | None) -> dict[str, Any]:
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST" if body is not None else "GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise OllamaError(f"Ollama HTTP error {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise OllamaError(f"Could not reach Ollama at {self.base_url}: {exc}") from exc

