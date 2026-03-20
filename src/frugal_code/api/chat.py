"""Chat completions endpoint."""

import time
import uuid
from typing import AsyncIterator

import litellm
from fastapi import APIRouter, HTTPException
from litellm import acompletion
from sse_starlette.sse import EventSourceResponse

from ..classifier import HeuristicClassifier
from ..config import settings
from ..models import (
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatCompletionStreamResponse,
    Choice,
    Message,
    StreamChoice,
    Usage,
)
from ..router import ModelRouter
from ..telemetry import (
    add_classification_attributes,
    add_completion_attributes,
    trace_classification,
    trace_completion,
)

# Drop unsupported params automatically (e.g., presence_penalty for Ollama)
litellm.drop_params = True

router = APIRouter()

# Initialize classifier and router
classifier = HeuristicClassifier()
model_router = ModelRouter()


async def stream_completion(
    request: ChatCompletionRequest,
    model: str,
    api_key: str | None = None,
    api_base: str | None = None,
) -> AsyncIterator[str]:
    """Stream completion chunks as SSE."""
    request_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
    created = int(time.time())

    # LiteLLM streaming
    response = await acompletion(
        model=model,
        messages=[msg.model_dump() for msg in request.messages],
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        top_p=request.top_p,
        frequency_penalty=request.frequency_penalty,
        presence_penalty=request.presence_penalty,
        stop=request.stop,
        stream=True,
        api_key=api_key,
        api_base=api_base,
    )

    async for chunk in response:
        delta = {}
        if hasattr(chunk.choices[0], "delta") and chunk.choices[0].delta:
            delta_obj = chunk.choices[0].delta
            if hasattr(delta_obj, "content") and delta_obj.content:
                delta["content"] = delta_obj.content
            if hasattr(delta_obj, "role") and delta_obj.role:
                delta["role"] = delta_obj.role

        stream_chunk = ChatCompletionStreamResponse(
            id=request_id,
            created=created,
            model=model,
            choices=[
                StreamChoice(
                    index=0,
                    delta=delta,
                    finish_reason=(
                        chunk.choices[0].finish_reason
                        if hasattr(chunk.choices[0], "finish_reason")
                        else None
                    ),
                )
            ],
        )

        yield f"data: {stream_chunk.model_dump_json()}\n\n"

    yield "data: [DONE]\n\n"


@router.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """
    OpenAI-compatible chat completions endpoint with smart routing.

    Flow:
    1. Classify request complexity (if no explicit model)
    2. Route to appropriate model
    3. Call LiteLLM
    4. Return response
    """
    classification = None
    routing_reason = ""

    # If client didn't specify model, classify with tracing
    if not request.model:
        with trace_classification() as classify_span:
            classification = await classifier.classify(request)
            add_classification_attributes(classify_span, classification)

    # Select model based on classification (or client override)
    model, routing_reason, model_config = model_router.select_model(classification, request)

    # Resolve API key and base URL from model config
    api_key = None
    api_base = None
    if model_config:
        api_key = model_config.api_key or settings.get_api_key(model_config.provider)
        api_base = model_config.base_url
    else:
        # Client override — try to infer provider from model name
        provider = model.split("/")[0] if "/" in model else "openai"
        api_key = settings.get_api_key(provider)
        # Fall back to global base URL for known providers
        if provider == "ollama" and settings.ollama_base_url:
            api_base = settings.ollama_base_url

    # Log routing decision
    print(f"🎯 Routing: {routing_reason} → {model}")
    if classification:
        print(f"   Classification: {classification.reason}")

    try:
        if request.stream:
            return EventSourceResponse(
                stream_completion(request, model, api_key=api_key, api_base=api_base)
            )

        # Non-streaming with tracing
        with trace_completion(model) as completion_span:
            response = await acompletion(
                model=model,
                messages=[msg.model_dump() for msg in request.messages],
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                top_p=request.top_p,
                frequency_penalty=request.frequency_penalty,
                presence_penalty=request.presence_penalty,
                stop=request.stop,
                stream=False,
                api_key=api_key,
                api_base=api_base,
            )

            # Add telemetry attributes
            estimated_cost = model_router.estimate_cost(
                model,
                response.usage.prompt_tokens,
                response.usage.completion_tokens,
            )
            max_cost = model_router.estimate_cost(
                "gpt-4o",
                response.usage.prompt_tokens,
                response.usage.completion_tokens,
            )
            estimated_savings = max(0.0, max_cost - estimated_cost)

            add_completion_attributes(
                completion_span, model, response.usage, estimated_cost, estimated_savings
            )

            # Convert LiteLLM response to our model
            return ChatCompletionResponse(
                id=response.id or f"chatcmpl-{uuid.uuid4().hex[:24]}",
                created=response.created or int(time.time()),
                model=response.model or model,
                choices=[
                    Choice(
                        index=choice.index,
                        message=Message(
                            role=choice.message.role,
                            content=choice.message.content or "",
                        ),
                        finish_reason=choice.finish_reason,
                    )
                    for choice in response.choices
                ],
                usage=Usage(
                    prompt_tokens=response.usage.prompt_tokens,
                    completion_tokens=response.usage.completion_tokens,
                    total_tokens=response.usage.total_tokens,
                ),
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")
