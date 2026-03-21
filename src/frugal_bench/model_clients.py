from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol


class ModelClientError(RuntimeError):
    """Raised when a model provider returns an error."""


@dataclass
class ModelResponse:
    response_text: str
    raw: dict[str, Any]
    latency_seconds: float


class ModelClient(Protocol):
    def list_models(self) -> list[str]:
        ...

    def generate(
        self,
        model: str,
        prompt: str,
        system: str | None = None,
        temperature: float = 0.0,
        num_predict: int | None = None,
    ) -> ModelResponse:
        ...


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
    ) -> ModelResponse:
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
        return ModelResponse(
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
            raise ModelClientError(f"Ollama HTTP error {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise ModelClientError(f"Could not reach Ollama at {self.base_url}: {exc}") from exc


class OpenAICompatibleClient:
    def __init__(self, base_url: str, api_key: str | None, timeout_seconds: int = 120) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def list_models(self) -> list[str]:
        payload = self._request_json("/v1/models", None)
        return [item["id"] for item in payload.get("data", [])]

    def generate(
        self,
        model: str,
        prompt: str,
        system: str | None = None,
        temperature: float = 0.0,
        num_predict: int | None = None,
    ) -> ModelResponse:
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if num_predict is not None:
            body["max_tokens"] = num_predict

        started = time.perf_counter()
        try:
            payload = self._request_json("/v1/chat/completions", body)
        except ModelClientError as exc:
            message = str(exc)
            if "Unsupported parameter: 'max_tokens'" in message and num_predict is not None:
                retry_body = dict(body)
                retry_body.pop("max_tokens", None)
                retry_body["max_completion_tokens"] = num_predict
                payload = self._request_json("/v1/chat/completions", retry_body)
            else:
                raise
        latency = time.perf_counter() - started
        response_text = _extract_openai_response_text(payload)
        normalized_payload = _normalize_openai_payload(payload)
        return ModelResponse(
            response_text=response_text,
            raw=normalized_payload,
            latency_seconds=latency,
        )

    def _request_json(self, path: str, body: dict[str, Any] | None) -> dict[str, Any]:
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers=headers,
            method="POST" if body is not None else "GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise ModelClientError(f"OpenAI-compatible HTTP error {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise ModelClientError(
                f"Could not reach OpenAI-compatible endpoint at {self.base_url}: {exc}"
            ) from exc


def build_client(
    provider: str,
    base_url: str,
    api_key: str | None = None,
    timeout_seconds: int = 120,
) -> ModelClient:
    if provider == "ollama":
        return OllamaClient(base_url=base_url, timeout_seconds=timeout_seconds)
    if provider == "openai-compatible":
        return OpenAICompatibleClient(
            base_url=base_url,
            api_key=api_key,
            timeout_seconds=timeout_seconds,
        )
    raise ValueError(f"Unsupported provider: {provider}")


def _extract_openai_response_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices", [])
    if not choices:
        return ""
    message = choices[0].get("message", {})
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text = item.get("text")
                if isinstance(text, str):
                    text_parts.append(text)
        return "".join(text_parts)
    return str(content)


def _normalize_openai_payload(payload: dict[str, Any]) -> dict[str, Any]:
    usage = payload.get("usage", {})
    choices = payload.get("choices", [])
    finish_reason = None
    if choices:
        finish_reason = choices[0].get("finish_reason")
    normalized = dict(payload)
    normalized["prompt_eval_count"] = usage.get("prompt_tokens")
    normalized["eval_count"] = usage.get("completion_tokens")
    normalized["prompt_eval_duration"] = None
    normalized["eval_duration"] = None
    normalized["load_duration"] = None
    normalized["total_duration"] = None
    normalized["done_reason"] = finish_reason
    return normalized
