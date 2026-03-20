"""Pydantic models for OpenAI-compatible Chat Completions API."""

from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field


class Message(BaseModel):
    """Chat message."""

    role: Literal["system", "user", "assistant"] = Field(..., description="Message role")
    content: str = Field(..., description="Message content")


class ChatCompletionRequest(BaseModel):
    """OpenAI-compatible chat completion request."""

    model: str | None = Field(None, description="Model name (optional, will be routed)")
    messages: List[Message] = Field(..., min_length=1, description="Conversation messages")
    temperature: float = Field(1.0, ge=0.0, le=2.0, description="Sampling temperature")
    max_tokens: int | None = Field(None, gt=0, description="Max tokens to generate")
    stream: bool = Field(False, description="Stream response via SSE")
    top_p: float = Field(1.0, ge=0.0, le=1.0, description="Nucleus sampling")
    frequency_penalty: float = Field(0.0, ge=-2.0, le=2.0)
    presence_penalty: float = Field(0.0, ge=-2.0, le=2.0)
    stop: List[str] | str | None = Field(None, description="Stop sequences")

    # Metadata (not sent to LLM)
    user: str | None = Field(None, description="User identifier")


class Usage(BaseModel):
    """Token usage statistics."""

    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class Choice(BaseModel):
    """Completion choice."""

    index: int
    message: Message
    finish_reason: str | None = None


class ChatCompletionResponse(BaseModel):
    """OpenAI-compatible chat completion response."""

    id: str
    object: Literal["chat.completion"] = "chat.completion"
    created: int
    model: str
    choices: List[Choice]
    usage: Usage


class StreamChoice(BaseModel):
    """Streaming completion choice."""

    index: int
    delta: Dict[str, Any]
    finish_reason: str | None = None


class ChatCompletionStreamResponse(BaseModel):
    """OpenAI-compatible streaming response chunk."""

    id: str
    object: Literal["chat.completion.chunk"] = "chat.completion.chunk"
    created: int
    model: str
    choices: List[StreamChoice]
