# Implementation Plan: Frugal-AI

**Created:** 2026-03-20  
**Status:** Ready for Implementation  
**Estimated Total Time:** 16-24 hours

---

## Executive Summary

Frugal-AI is an OpenAI-compatible AI proxy that intelligently routes requests to the most cost-effective model based on prompt complexity. Built with FastAPI + LiteLLM, it provides full observability via OpenTelemetry and supports multiple LLM providers. The implementation follows a TDD approach across 6 phases, starting with foundational infrastructure and progressively adding classification, routing, telemetry, and feedback capabilities.

**Key Outcomes:**
- OpenAI-compatible API (`/v1/chat/completions`)
- Heuristic-based complexity classification
- Configurable multi-tier routing
- Full OpenTelemetry instrumentation with GenAI semantic conventions
- User feedback collection endpoint
- Production-ready with Docker deployment

---

## Approach Chosen

**Custom FastAPI + LiteLLM SDK**

**Why:** Maximum control over routing logic, full OTel integration, multi-provider support via LiteLLM, and clear "we built this" demo narrative. Avoids the complexity of adapting existing solutions (Open WebUI, LiteLLM Proxy) that weren't designed for dynamic classification-based routing.

---

## Prerequisites

**Environment Setup:**
- Python 3.12+ installed
- Git repository initialized
- Environment variables file (`.env`) for API keys

**Dependencies:**
- All managed via `pyproject.toml` (created in Phase 1)
- Development tools: `pytest`, `httpx`, `pytest-asyncio`

**Branch Setup:**
- Work on `main` or create a feature branch: `git checkout -b implement/initial-proxy`

**External Services (for testing):**
- OpenAI API key (or Anthropic, OpenRouter, etc.)
- Docker installed (for Jaeger in Phase 5)

---

## Phase Breakdown

**Total Phases:** 6 (estimated 16-24 hours total)

---

### Phase 1: Project Scaffolding & Configuration System

**Objective:** Set up the project structure, dependency management, and configuration system using pydantic-settings.

**Estimated Time:** 90-120 minutes

**Files to Create:**

- `pyproject.toml` - Project metadata, dependencies, build config
  ```toml
  [project]
  name = "frugal-code"
  version = "0.1.0"
  requires-python = ">=3.12"
  dependencies = [
      "fastapi>=0.110.0",
      "uvicorn[standard]>=0.27.0",
      "litellm>=1.30.0",
      "opentelemetry-api>=1.23.0",
      "opentelemetry-sdk>=1.23.0",
      "opentelemetry-exporter-otlp>=1.23.0",
      "opentelemetry-instrumentation-fastapi>=0.44b0",
      "opentelemetry-semantic-conventions>=0.44b0",
      "pydantic>=2.6.0",
      "pydantic-settings>=2.2.0",
      "sse-starlette>=2.0.0",
      "tiktoken>=0.6.0",
      "aiosqlite>=0.19.0",
  ]
  
  [project.optional-dependencies]
  dev = [
      "pytest>=8.0.0",
      "pytest-asyncio>=0.23.0",
      "httpx>=0.27.0",
      "ruff>=0.2.0",
  ]
  
  [build-system]
  requires = ["hatchling"]
  build-backend = "hatchling.build"
  
  [tool.pytest.ini_options]
  asyncio_mode = "auto"
  pythonpath = ["src"]
  ```

- `src/frugal_code/__init__.py` - Package marker with version
  ```python
  """Frugal-AI: Complexity-aware LLM proxy."""
  __version__ = "0.1.0"
  ```

- `src/frugal_code/config.py` - Pydantic settings with model tier configuration
  ```python
  from enum import Enum
  from typing import Dict, List
  from pydantic import BaseModel, Field
  from pydantic_settings import BaseSettings, SettingsConfigDict
  
  
  class ComplexityTier(str, Enum):
      """Complexity tier enum - extensible design."""
      SIMPLE = "simple"
      COMPLEX = "complex"
      # Future: MEDIUM = "medium"
  
  
  class ModelConfig(BaseModel):
      """Configuration for a single model."""
      name: str = Field(..., description="Model name (e.g., 'gpt-4o-mini')")
      provider: str = Field(..., description="Provider (openai, anthropic, ollama, etc.)")
      base_url: str | None = Field(None, description="Custom base URL for provider")
      api_key: str | None = Field(None, description="API key (or use global)")
      priority: int = Field(1, description="Selection priority (higher = preferred)")
  
  
  class Settings(BaseSettings):
      """Application settings loaded from environment and .env file."""
      
      model_config = SettingsConfigDict(
          env_file=".env",
          env_file_encoding="utf-8",
          env_nested_delimiter="__",
          extra="ignore",
      )
      
      # Service
      service_name: str = Field("frugal-ai", description="Service name for telemetry")
      host: str = Field("0.0.0.0", description="Server host")
      port: int = Field(8000, description="Server port")
      
      # Model Tiers - JSON structure in env: MODEL_TIERS='{"simple": [...], "complex": [...]}'
      model_tiers: Dict[ComplexityTier, List[ModelConfig]] = Field(
          default_factory=lambda: {
              ComplexityTier.SIMPLE: [
                  ModelConfig(name="gpt-4o-mini", provider="openai", priority=1),
              ],
              ComplexityTier.COMPLEX: [
                  ModelConfig(name="gpt-4o", provider="openai", priority=1),
              ],
          },
          description="Model tier mappings",
      )
      
      # Default provider credentials (can be overridden per-model)
      openai_api_key: str | None = Field(None, env="OPENAI_API_KEY")
      anthropic_api_key: str | None = Field(None, env="ANTHROPIC_API_KEY")
      
      # Telemetry
      otel_exporter_otlp_endpoint: str = Field(
          "http://localhost:4317",
          description="OTLP endpoint for traces",
      )
      otel_enabled: bool = Field(True, description="Enable OpenTelemetry")
      
      # Feedback storage
      feedback_db_path: str = Field("data/feedback.db", description="SQLite DB path")
      
      def get_api_key(self, provider: str) -> str | None:
          """Get API key for a provider."""
          key_map = {
              "openai": self.openai_api_key,
              "anthropic": self.anthropic_api_key,
          }
          return key_map.get(provider.lower())
  
  
  # Singleton instance
  settings = Settings()
  ```

- `src/frugal_code/main.py` - FastAPI app with health endpoint
  ```python
  from contextlib import asynccontextmanager
  from fastapi import FastAPI
  from .config import settings
  
  
  @asynccontextmanager
  async def lifespan(app: FastAPI):
      """Application lifespan: startup and shutdown."""
      # Startup
      print(f"🚀 Starting {settings.service_name} on {settings.host}:{settings.port}")
      print(f"📊 OpenTelemetry: {'enabled' if settings.otel_enabled else 'disabled'}")
      
      yield
      
      # Shutdown
      print("👋 Shutting down...")
  
  
  app = FastAPI(
      title="Frugal-AI",
      description="Complexity-aware LLM proxy",
      version="0.1.0",
      lifespan=lifespan,
  )
  
  
  @app.get("/health")
  async def health():
      """Health check endpoint."""
      return {
          "status": "healthy",
          "service": settings.service_name,
          "version": "0.1.0",
      }
  ```

- `.env.example` - Environment template
  ```env
  # Service
  SERVICE_NAME=frugal-ai
  HOST=0.0.0.0
  PORT=8000
  
  # Providers
  OPENAI_API_KEY=sk-...
  ANTHROPIC_API_KEY=sk-ant-...
  
  # Telemetry
  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
  OTEL_ENABLED=true
  
  # Feedback
  FEEDBACK_DB_PATH=data/feedback.db
  ```

- `.gitignore` - Git ignore patterns
  ```
  # Python
  __pycache__/
  *.py[cod]
  *$py.class
  .Python
  *.so
  .pytest_cache/
  
  # Environment
  .env
  .venv/
  venv/
  
  # Data
  data/
  *.db
  *.db-journal
  
  # IDE
  .vscode/
  .idea/
  *.swp
  ```

- `tests/__init__.py` - Empty test package marker

- `tests/conftest.py` - Pytest fixtures
  ```python
  import pytest
  from fastapi.testclient import TestClient
  from frugal_code.main import app
  from frugal_code.config import settings
  
  
  @pytest.fixture
  def client():
      """FastAPI test client."""
      return TestClient(app)
  
  
  @pytest.fixture
  def mock_settings():
      """Mock settings for testing."""
      return settings
  ```

**Tests to Write First (TDD):**

1. `tests/test_config.py` - Test configuration loading
   ```python
   def test_default_settings_load():
       """Test that default settings load without error."""
       from frugal_code.config import settings, ComplexityTier
       assert settings.service_name == "frugal-ai"
       assert ComplexityTier.SIMPLE in settings.model_tiers
       assert ComplexityTier.COMPLEX in settings.model_tiers
   
   def test_complexity_tier_enum():
       """Test complexity tier enum values."""
       from frugal_code.config import ComplexityTier
       assert ComplexityTier.SIMPLE.value == "simple"
       assert ComplexityTier.COMPLEX.value == "complex"
       assert len(list(ComplexityTier)) == 2  # Only 2 tiers for now
   
   def test_model_config_validation():
       """Test ModelConfig pydantic validation."""
       from frugal_code.config import ModelConfig
       model = ModelConfig(name="gpt-4o", provider="openai")
       assert model.name == "gpt-4o"
       assert model.provider == "openai"
       assert model.priority == 1  # Default
   
   def test_get_api_key():
       """Test API key lookup by provider."""
       from frugal_code.config import settings
       # Will return None if not set, but shouldn't raise
       key = settings.get_api_key("openai")
       assert key is None or isinstance(key, str)
   ```

2. `tests/test_main.py` - Test FastAPI app
   ```python
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
   ```

**Implementation Steps:**

1. Create project structure: `mkdir -p src/frugal_code tests`
2. Write `tests/test_config.py` with failing tests
3. Create `pyproject.toml` with dependencies
4. Install project: `pip install -e ".[dev]"`
5. Write `src/frugal_code/config.py` to pass config tests
6. Run: `pytest tests/test_config.py` → verify passes
7. Write `tests/test_main.py` with failing tests
8. Write `src/frugal_code/main.py` to pass main tests
9. Run: `pytest tests/test_main.py` → verify passes
10. Create `.env.example` and `.gitignore`
11. Run full test suite: `pytest` → all pass
12. Manual test: `uvicorn frugal_code.main:app --reload` → verify runs
13. Test: `curl http://localhost:8000/health` → verify JSON response

**Acceptance Criteria:**

- [ ] Project installs cleanly with `pip install -e ".[dev]"`
- [ ] All tests pass: `pytest` shows 6 passed tests
- [ ] Server starts: `uvicorn frugal_code.main:app`
- [ ] Health endpoint returns 200: `GET /health`
- [ ] Config loads from `.env` file (if present)
- [ ] ComplexityTier enum has 2 values (SIMPLE, COMPLEX)
- [ ] No linter errors: `ruff check src tests`

**Dependencies:** None

---

### Phase 2: OpenAI-Compatible API + LiteLLM Pass-through

**Objective:** Implement the `/v1/chat/completions` endpoint with OpenAI-compatible request/response models and pass-through to LiteLLM (no routing yet).

**Estimated Time:** 120-180 minutes

**Files to Create:**

- `src/frugal_code/models.py` - Pydantic models for OpenAI API
  ```python
  from typing import List, Dict, Any, Literal
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
  ```

- `src/frugal_code/api/__init__.py` - API package marker

- `src/frugal_code/api/chat.py` - Chat completions endpoint
  ```python
  import time
  import uuid
  from typing import AsyncIterator
  from fastapi import APIRouter, HTTPException
  from sse_starlette.sse import EventSourceResponse
  from litellm import acompletion
  from ..models import ChatCompletionRequest, ChatCompletionResponse, ChatCompletionStreamResponse, Choice, Message, Usage, StreamChoice
  from ..config import settings
  
  router = APIRouter()
  
  
  async def stream_completion(request: ChatCompletionRequest, model: str) -> AsyncIterator[str]:
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
          api_key=settings.get_api_key(model.split("/")[0]) if "/" not in model else settings.openai_api_key,
      )
      
      async for chunk in response:
          delta = {}
          if hasattr(chunk.choices[0], 'delta') and chunk.choices[0].delta:
              delta_obj = chunk.choices[0].delta
              if hasattr(delta_obj, 'content') and delta_obj.content:
                  delta["content"] = delta_obj.content
              if hasattr(delta_obj, 'role') and delta_obj.role:
                  delta["role"] = delta_obj.role
          
          stream_chunk = ChatCompletionStreamResponse(
              id=request_id,
              created=created,
              model=model,
              choices=[StreamChoice(
                  index=0,
                  delta=delta,
                  finish_reason=chunk.choices[0].finish_reason if hasattr(chunk.choices[0], 'finish_reason') else None,
              )],
          )
          
          yield f"data: {stream_chunk.model_dump_json()}\n\n"
      
      yield "data: [DONE]\n\n"
  
  
  @router.post("/v1/chat/completions")
  async def chat_completions(request: ChatCompletionRequest):
      """
      OpenAI-compatible chat completions endpoint.
      
      For now, uses a default model (pass-through). Routing will be added in Phase 4.
      """
      # Use requested model or default to gpt-4o-mini
      model = request.model or "gpt-4o-mini"
      
      try:
          if request.stream:
              return EventSourceResponse(stream_completion(request, model))
          
          # Non-streaming
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
              api_key=settings.get_api_key(model.split("/")[0]) if "/" not in model else settings.openai_api_key,
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
  ```

**Files to Modify:**

- `src/frugal_code/main.py` - Register chat router
  ```python
  # Add after app creation:
  from .api.chat import router as chat_router
  app.include_router(chat_router)
  ```

**Tests to Write First (TDD):**

1. `tests/test_models.py` - Test Pydantic models
   ```python
   def test_message_creation():
       """Test Message model."""
       from frugal_code.models import Message
       msg = Message(role="user", content="Hello")
       assert msg.role == "user"
       assert msg.content == "Hello"
   
   def test_chat_completion_request_validation():
       """Test request model validation."""
       from frugal_code.models import ChatCompletionRequest, Message
       
       # Valid request
       req = ChatCompletionRequest(
           messages=[Message(role="user", content="Test")]
       )
       assert len(req.messages) == 1
       assert req.temperature == 1.0  # Default
       assert req.stream is False  # Default
       
       # Invalid: empty messages
       import pytest
       with pytest.raises(Exception):
           ChatCompletionRequest(messages=[])
   
   def test_chat_completion_response_structure():
       """Test response model structure."""
       from frugal_code.models import ChatCompletionResponse, Choice, Message, Usage
       
       response = ChatCompletionResponse(
           id="test-123",
           created=1234567890,
           model="gpt-4o-mini",
           choices=[Choice(index=0, message=Message(role="assistant", content="Hi"))],
           usage=Usage(prompt_tokens=10, completion_tokens=20, total_tokens=30),
       )
       assert response.object == "chat.completion"
       assert response.usage.total_tokens == 30
   ```

2. `tests/test_api.py` - Test chat endpoint (mocked)
   ```python
   import pytest
   from unittest.mock import AsyncMock, patch, MagicMock
   
   @pytest.mark.asyncio
   async def test_chat_completions_endpoint_exists(client):
       """Test that /v1/chat/completions endpoint exists."""
       # Will fail until we implement, but won't call real LLM
       response = client.post("/v1/chat/completions", json={
           "messages": [{"role": "user", "content": "test"}]
       })
       # Expect 500 or other error (no real API key), but not 404
       assert response.status_code != 404
   
   @pytest.mark.asyncio
   async def test_chat_completions_with_mock(client):
       """Test chat completions with mocked LiteLLM."""
       mock_response = MagicMock()
       mock_response.id = "chatcmpl-test123"
       mock_response.created = 1234567890
       mock_response.model = "gpt-4o-mini"
       mock_response.usage.prompt_tokens = 10
       mock_response.usage.completion_tokens = 5
       mock_response.usage.total_tokens = 15
       
       mock_choice = MagicMock()
       mock_choice.index = 0
       mock_choice.message.role = "assistant"
       mock_choice.message.content = "Hello!"
       mock_choice.finish_reason = "stop"
       mock_response.choices = [mock_choice]
       
       with patch("frugal_code.api.chat.acompletion", new_callable=AsyncMock, return_value=mock_response):
           response = client.post("/v1/chat/completions", json={
               "messages": [{"role": "user", "content": "Hi"}],
               "model": "gpt-4o-mini",
           })
       
       assert response.status_code == 200
       data = response.json()
       assert data["id"] == "chatcmpl-test123"
       assert data["choices"][0]["message"]["content"] == "Hello!"
       assert data["usage"]["total_tokens"] == 15
   
   @pytest.mark.asyncio
   async def test_chat_completions_defaults_to_mini(client):
       """Test that omitting model defaults to gpt-4o-mini."""
       with patch("frugal_code.api.chat.acompletion", new_callable=AsyncMock) as mock_completion:
           mock_response = MagicMock()
           mock_response.id = "test"
           mock_response.created = 123
           mock_response.model = "gpt-4o-mini"
           mock_response.usage.prompt_tokens = 1
           mock_response.usage.completion_tokens = 1
           mock_response.usage.total_tokens = 2
           mock_choice = MagicMock()
           mock_choice.index = 0
           mock_choice.message.role = "assistant"
           mock_choice.message.content = "Hi"
           mock_choice.finish_reason = "stop"
           mock_response.choices = [mock_choice]
           mock_completion.return_value = mock_response
           
           response = client.post("/v1/chat/completions", json={
               "messages": [{"role": "user", "content": "test"}]
           })
           
           # Verify acompletion was called with gpt-4o-mini
           assert mock_completion.called
           call_kwargs = mock_completion.call_args.kwargs
           assert call_kwargs["model"] == "gpt-4o-mini"
   ```

**Implementation Steps:**

1. Write `tests/test_models.py` with failing tests
2. Run: `pytest tests/test_models.py` → verify failures
3. Implement `src/frugal_code/models.py` to pass tests
4. Run: `pytest tests/test_models.py` → verify passes
5. Write `tests/test_api.py` with failing/mocked tests
6. Create `src/frugal_code/api/__init__.py`
7. Implement `src/frugal_code/api/chat.py` endpoint
8. Modify `src/frugal_code/main.py` to register router
9. Run: `pytest tests/test_api.py` → verify passes
10. Run full test suite: `pytest` → all pass
11. Manual test with real LLM (requires API key in `.env`):
    ```bash
    curl -X POST http://localhost:8000/v1/chat/completions \
      -H "Content-Type: application/json" \
      -d '{"messages": [{"role": "user", "content": "Say hello"}]}'
    ```
12. Test streaming:
    ```bash
    curl -X POST http://localhost:8000/v1/chat/completions \
      -H "Content-Type: application/json" \
      -d '{"messages": [{"role": "user", "content": "Count to 5"}], "stream": true}'
    ```

**Acceptance Criteria:**

- [ ] All tests pass: `pytest` (13+ tests)
- [ ] POST `/v1/chat/completions` returns OpenAI-compatible JSON
- [ ] Streaming works: `stream: true` returns SSE events
- [ ] LiteLLM successfully calls OpenAI (or configured provider)
- [ ] No model specified → defaults to `gpt-4o-mini`
- [ ] Custom model specified → uses that model
- [ ] Response includes `usage` with token counts
- [ ] Error handling: invalid request returns 422, LLM error returns 500
- [ ] No linter errors

**Dependencies:** Requires Phase 1 complete

---

### Phase 3: Complexity Classifier

**Objective:** Implement the heuristic-based complexity classifier that analyzes requests and assigns a complexity tier (SIMPLE or COMPLEX).

**Estimated Time:** 120-150 minutes

**Files to Create:**

- `src/frugal_code/classifier/__init__.py` - Classifier package
  ```python
  from .base import ClassifierBase, ClassificationResult
  from .heuristic import HeuristicClassifier
  
  __all__ = ["ClassifierBase", "ClassificationResult", "HeuristicClassifier"]
  ```

- `src/frugal_code/classifier/base.py` - Abstract classifier interface
  ```python
  from abc import ABC, abstractmethod
  from dataclasses import dataclass
  from ..config import ComplexityTier
  from ..models import ChatCompletionRequest
  
  
  @dataclass
  class ClassificationResult:
      """Result of complexity classification."""
      tier: ComplexityTier
      score: float  # 0.0 (simple) to 1.0 (complex)
      reason: str  # Human-readable explanation
      classifier_type: str  # Which classifier was used
  
  
  class ClassifierBase(ABC):
      """Base class for complexity classifiers."""
      
      @abstractmethod
      async def classify(self, request: ChatCompletionRequest) -> ClassificationResult:
          """
          Classify a chat completion request.
          
          Args:
              request: The chat completion request to classify
          
          Returns:
              ClassificationResult with tier, score, and reason
          """
          pass
  ```

- `src/frugal_code/classifier/heuristic.py` - Heuristic classifier implementation
  ```python
  import re
  import tiktoken
  from ..config import ComplexityTier
  from ..models import ChatCompletionRequest
  from .base import ClassifierBase, ClassificationResult
  
  
  class HeuristicClassifier(ClassifierBase):
      """
      Heuristic-based complexity classifier.
      
      Analyzes prompt characteristics to determine complexity:
      - Token count
      - Conversation length
      - Code blocks
      - Complexity keywords
      - Structural patterns
      """
      
      # Complexity indicators
      COMPLEX_KEYWORDS = [
          "analyze", "explain in detail", "step by step", "comprehensive",
          "compare and contrast", "evaluate", "research", "investigate",
          "write a full", "create a detailed", "design", "architect",
          "debug", "optimize", "refactor", "implement",
      ]
      
      SIMPLE_KEYWORDS = [
          "what is", "define", "list", "name", "yes or no", "true or false",
          "translate", "summarize briefly", "quick", "simple",
      ]
      
      # Thresholds
      LONG_PROMPT_TOKENS = 500  # Tokens in user messages
      MANY_TURNS = 5  # Number of conversation turns
      
      def __init__(self):
          """Initialize the heuristic classifier."""
          self.encoder = tiktoken.get_encoding("cl100k_base")  # GPT-4 encoding
      
      async def classify(self, request: ChatCompletionRequest) -> ClassificationResult:
          """Classify request complexity using heuristics."""
          score = 0.0
          reasons = []
          
          # 1. Token count (weight: 0.3)
          user_messages = [msg for msg in request.messages if msg.role == "user"]
          total_tokens = sum(len(self.encoder.encode(msg.content)) for msg in user_messages)
          
          if total_tokens > self.LONG_PROMPT_TOKENS:
              token_score = min(1.0, total_tokens / (self.LONG_PROMPT_TOKENS * 2))
              score += token_score * 0.3
              reasons.append(f"Long prompt ({total_tokens} tokens)")
          
          # 2. Conversation length (weight: 0.2)
          num_turns = len([msg for msg in request.messages if msg.role in ["user", "assistant"]])
          if num_turns >= self.MANY_TURNS:
              turn_score = min(1.0, num_turns / (self.MANY_TURNS * 2))
              score += turn_score * 0.2
              reasons.append(f"Long conversation ({num_turns} turns)")
          
          # 3. Code blocks (weight: 0.2)
          combined_content = " ".join(msg.content for msg in request.messages)
          code_blocks = len(re.findall(r"```[\s\S]*?```", combined_content))
          if code_blocks > 0:
              score += min(1.0, code_blocks / 3) * 0.2
              reasons.append(f"Contains code ({code_blocks} blocks)")
          
          # 4. Complexity keywords (weight: 0.2)
          content_lower = combined_content.lower()
          complex_keyword_count = sum(1 for kw in self.COMPLEX_KEYWORDS if kw in content_lower)
          simple_keyword_count = sum(1 for kw in self.SIMPLE_KEYWORDS if kw in content_lower)
          
          if complex_keyword_count > simple_keyword_count:
              keyword_score = min(1.0, complex_keyword_count / 3)
              score += keyword_score * 0.2
              reasons.append(f"Complex keywords ({complex_keyword_count})")
          elif simple_keyword_count > 0:
              score -= 0.1  # Slight penalty for simple keywords
              reasons.append("Simple keywords detected")
          
          # 5. Structural complexity (weight: 0.1)
          # Lists, numbered steps, multiple questions
          has_list = bool(re.search(r"^\s*[-*]\s", combined_content, re.MULTILINE))
          has_numbered = bool(re.search(r"^\s*\d+\.\s", combined_content, re.MULTILINE))
          question_count = combined_content.count("?")
          
          if has_list or has_numbered or question_count > 2:
              score += 0.1
              reasons.append("Structured/multi-part query")
          
          # Normalize score to 0-1
          score = max(0.0, min(1.0, score))
          
          # Determine tier (threshold: 0.5)
          tier = ComplexityTier.COMPLEX if score >= 0.5 else ComplexityTier.SIMPLE
          
          reason = f"Score: {score:.2f}. " + "; ".join(reasons) if reasons else f"Score: {score:.2f}"
          
          return ClassificationResult(
              tier=tier,
              score=score,
              reason=reason,
              classifier_type="heuristic",
          )
  ```

**Tests to Write First (TDD):**

1. `tests/test_classifier.py` - Comprehensive classifier tests
   ```python
   import pytest
   from frugal_code.models import ChatCompletionRequest, Message
   from frugal_code.classifier import HeuristicClassifier, ClassificationResult
   from frugal_code.config import ComplexityTier
   
   
   @pytest.mark.asyncio
   async def test_simple_short_question():
       """Test that a short, simple question is classified as SIMPLE."""
       classifier = HeuristicClassifier()
       request = ChatCompletionRequest(
           messages=[Message(role="user", content="What is the capital of France?")]
       )
       result = await classifier.classify(request)
       
       assert result.tier == ComplexityTier.SIMPLE
       assert result.score < 0.5
       assert result.classifier_type == "heuristic"
   
   
   @pytest.mark.asyncio
   async def test_complex_long_prompt():
       """Test that a long, detailed prompt is classified as COMPLEX."""
       classifier = HeuristicClassifier()
       long_content = "Analyze and compare the architectural differences between microservices and monolithic applications. " * 30
       request = ChatCompletionRequest(
           messages=[Message(role="user", content=long_content)]
       )
       result = await classifier.classify(request)
       
       assert result.tier == ComplexityTier.COMPLEX
       assert result.score >= 0.5
       assert "tokens" in result.reason.lower()
   
   
   @pytest.mark.asyncio
   async def test_code_block_increases_complexity():
       """Test that code blocks increase complexity score."""
       classifier = HeuristicClassifier()
       request = ChatCompletionRequest(
           messages=[Message(role="user", content="Fix this code:\n```python\ndef broken(): pass\n```")]
       )
       result = await classifier.classify(request)
       
       assert "code" in result.reason.lower()
       # Code alone might not push to COMPLEX, but should increase score
       assert result.score > 0.0
   
   
   @pytest.mark.asyncio
   async def test_complex_keywords():
       """Test that complexity keywords increase score."""
       classifier = HeuristicClassifier()
       request = ChatCompletionRequest(
           messages=[Message(role="user", content="Analyze and explain in detail the step by step process")]
       )
       result = await classifier.classify(request)
       
       assert "keyword" in result.reason.lower()
       assert result.score > 0.0
   
   
   @pytest.mark.asyncio
   async def test_long_conversation():
       """Test that long conversations are classified as COMPLEX."""
       classifier = HeuristicClassifier()
       messages = []
       for i in range(6):
           messages.append(Message(role="user" if i % 2 == 0 else "assistant", content=f"Message {i}"))
       
       request = ChatCompletionRequest(messages=messages)
       result = await classifier.classify(request)
       
       assert "turns" in result.reason.lower() or "conversation" in result.reason.lower()
       assert result.score > 0.0
   
   
   @pytest.mark.asyncio
   async def test_simple_keywords_reduce_score():
       """Test that simple keywords can keep score low."""
       classifier = HeuristicClassifier()
       request = ChatCompletionRequest(
           messages=[Message(role="user", content="What is a list? Simple definition please.")]
       )
       result = await classifier.classify(request)
       
       # Should still be simple
       assert result.tier == ComplexityTier.SIMPLE
   
   
   @pytest.mark.asyncio
   async def test_classification_result_structure():
       """Test ClassificationResult dataclass."""
       from frugal_code.classifier.base import ClassificationResult
       
       result = ClassificationResult(
           tier=ComplexityTier.SIMPLE,
           score=0.3,
           reason="Test reason",
           classifier_type="test",
       )
       
       assert result.tier == ComplexityTier.SIMPLE
       assert result.score == 0.3
       assert result.reason == "Test reason"
       assert result.classifier_type == "test"
   ```

**Implementation Steps:**

1. Write `tests/test_classifier.py` with failing tests
2. Run: `pytest tests/test_classifier.py` → verify failures
3. Create `src/frugal_code/classifier/base.py` with ABC
4. Create `src/frugal_code/classifier/heuristic.py` with implementation
5. Create `src/frugal_code/classifier/__init__.py`
6. Run: `pytest tests/test_classifier.py` → verify passes
7. Tune thresholds if needed based on test results
8. Run full test suite: `pytest` → all pass
9. Manual testing: Create test script `scripts/test_classifier.py`:
   ```python
   import asyncio
   from frugal_code.classifier import HeuristicClassifier
   from frugal_code.models import ChatCompletionRequest, Message
   
   async def main():
       classifier = HeuristicClassifier()
       
       test_cases = [
           "What is 2+2?",
           "Explain the detailed architecture of microservices with code examples",
           "Write a comprehensive analysis of...",
       ]
       
       for content in test_cases:
           request = ChatCompletionRequest(messages=[Message(role="user", content=content)])
           result = await classifier.classify(request)
           print(f"\n{content[:50]}...")
           print(f"  Tier: {result.tier.value}, Score: {result.score:.2f}")
           print(f"  Reason: {result.reason}")
   
   if __name__ == "__main__":
       asyncio.run(main())
   ```
10. Run: `python scripts/test_classifier.py`

**Acceptance Criteria:**

- [ ] All tests pass: `pytest` (20+ tests)
- [ ] HeuristicClassifier correctly identifies simple prompts (score < 0.5)
- [ ] HeuristicClassifier correctly identifies complex prompts (score >= 0.5)
- [ ] Code blocks increase complexity score
- [ ] Long prompts (>500 tokens) increase score
- [ ] Long conversations (>5 turns) increase score
- [ ] Complex keywords ("analyze", "explain in detail") increase score
- [ ] Simple keywords ("what is", "define") keep score low
- [ ] ClassificationResult includes tier, score, reason, classifier_type
- [ ] No linter errors

**Dependencies:** Requires Phase 1 complete (config, models)

---

### Phase 4: Smart Router + Integration

**Objective:** Implement the router that maps complexity tiers to models, and integrate classifier → router → LiteLLM into the chat endpoint.

**Estimated Time:** 90-120 minutes

**Files to Create:**

- `src/frugal_code/router.py` - Model selection router
  ```python
  import random
  from typing import List
  from .config import settings, ComplexityTier, ModelConfig
  from .classifier.base import ClassificationResult
  from .models import ChatCompletionRequest
  
  
  class ModelRouter:
      """
      Routes requests to models based on complexity tier.
      
      Supports:
      - Tier-based routing (simple → cheap, complex → powerful)
      - Client model override (respect explicit model requests)
      - Priority-based selection when multiple models available
      """
      
      def __init__(self):
          """Initialize the router with settings."""
          self.model_tiers = settings.model_tiers
      
      def select_model(
          self,
          classification: ClassificationResult | None,
          request: ChatCompletionRequest,
      ) -> tuple[str, str]:
          """
          Select the appropriate model.
          
          Args:
              classification: Classification result (or None if override requested)
              request: Original request
          
          Returns:
              Tuple of (model_name, reason)
          """
          # Client explicitly requested a model?
          if request.model:
              return (request.model, f"Client requested: {request.model}")
          
          # No classification? Default to complex tier (safe fallback)
          if classification is None:
              classification_tier = ComplexityTier.COMPLEX
              reason = "No classification (defaulting to complex tier)"
          else:
              classification_tier = classification.tier
              reason = f"Classified as {classification_tier.value} (score: {classification.score:.2f})"
          
          # Get models for tier
          available_models = self.model_tiers.get(classification_tier, [])
          
          if not available_models:
              # Fallback: try complex tier, then simple
              if classification_tier != ComplexityTier.COMPLEX:
                  available_models = self.model_tiers.get(ComplexityTier.COMPLEX, [])
              if not available_models:
                  available_models = self.model_tiers.get(ComplexityTier.SIMPLE, [])
          
          if not available_models:
              raise ValueError(f"No models configured for tier {classification_tier.value}")
          
          # Sort by priority (highest first), then pick randomly among top priority
          sorted_models = sorted(available_models, key=lambda m: m.priority, reverse=True)
          top_priority = sorted_models[0].priority
          top_models = [m for m in sorted_models if m.priority == top_priority]
          
          selected = random.choice(top_models)
          
          # Format model name for LiteLLM
          model_name = self._format_model_name(selected)
          
          return (model_name, reason)
      
      def _format_model_name(self, model_config: ModelConfig) -> str:
          """Format model name for LiteLLM."""
          # LiteLLM format: "provider/model" or just "model" for OpenAI
          if model_config.provider.lower() == "openai":
              return model_config.name
          else:
              return f"{model_config.provider}/{model_config.name}"
      
      def estimate_cost(
          self,
          model: str,
          prompt_tokens: int,
          completion_tokens: int,
      ) -> float:
          """
          Estimate cost for a request (simplified).
          
          Returns cost in USD cents.
          """
          # Simplified cost model (would need actual pricing table)
          costs = {
              "gpt-4o-mini": {"input": 0.015, "output": 0.06},  # per 1M tokens
              "gpt-4o": {"input": 0.25, "output": 1.0},
              "claude-haiku": {"input": 0.025, "output": 0.125},
              "claude-sonnet": {"input": 0.3, "output": 1.5},
          }
          
          # Extract base model name
          base_model = model.split("/")[-1]
          
          if base_model not in costs:
              return 0.0  # Unknown model
          
          pricing = costs[base_model]
          input_cost = (prompt_tokens / 1_000_000) * pricing["input"] * 100  # cents
          output_cost = (completion_tokens / 1_000_000) * pricing["output"] * 100
          
          return input_cost + output_cost
  ```

**Files to Modify:**

- `src/frugal_code/api/chat.py` - Integrate classifier and router
  ```python
  # Add imports at top:
  from ..classifier import HeuristicClassifier
  from ..router import ModelRouter
  
  # Add after router = APIRouter():
  classifier = HeuristicClassifier()
  model_router = ModelRouter()
  
  # Modify chat_completions function:
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
      
      # If client didn't specify model, classify
      if not request.model:
          classification = await classifier.classify(request)
      
      # Select model based on classification (or client override)
      model, routing_reason = model_router.select_model(classification, request)
      
      # Log routing decision (will be added to OTel span in Phase 5)
      print(f"🎯 Routing: {routing_reason} → {model}")
      if classification:
          print(f"   Classification: {classification.reason}")
      
      try:
          # ... rest of the function remains the same ...
          # (Keep existing streaming and non-streaming logic)
  ```

**Tests to Write First (TDD):**

1. `tests/test_router.py` - Router logic tests
   ```python
   import pytest
   from frugal_code.router import ModelRouter
   from frugal_code.classifier.base import ClassificationResult
   from frugal_code.config import ComplexityTier
   from frugal_code.models import ChatCompletionRequest, Message
   
   
   def test_router_selects_simple_model():
       """Test router selects simple tier model for SIMPLE classification."""
       router = ModelRouter()
       classification = ClassificationResult(
           tier=ComplexityTier.SIMPLE,
           score=0.3,
           reason="Simple test",
           classifier_type="test",
       )
       request = ChatCompletionRequest(messages=[Message(role="user", content="test")])
       
       model, reason = router.select_model(classification, request)
       
       # Should select from simple tier (gpt-4o-mini by default)
       assert "mini" in model.lower() or "haiku" in model.lower()
       assert "simple" in reason.lower()
   
   
   def test_router_selects_complex_model():
       """Test router selects complex tier model for COMPLEX classification."""
       router = ModelRouter()
       classification = ClassificationResult(
           tier=ComplexityTier.COMPLEX,
           score=0.8,
           reason="Complex test",
           classifier_type="test",
       )
       request = ChatCompletionRequest(messages=[Message(role="user", content="test")])
       
       model, reason = router.select_model(classification, request)
       
       # Should select from complex tier (gpt-4o by default)
       assert "4o" in model or "opus" in model.lower() or "sonnet" in model.lower()
       assert "complex" in reason.lower()
   
   
   def test_router_respects_client_model_override():
       """Test router respects explicit model request from client."""
       router = ModelRouter()
       classification = ClassificationResult(
           tier=ComplexityTier.SIMPLE,
           score=0.2,
           reason="Simple",
           classifier_type="test",
       )
       request = ChatCompletionRequest(
           model="gpt-4o",  # Client wants expensive model
           messages=[Message(role="user", content="test")]
       )
       
       model, reason = router.select_model(classification, request)
       
       # Should use client's requested model
       assert model == "gpt-4o"
       assert "requested" in reason.lower()
   
   
   def test_router_handles_no_classification():
       """Test router defaults to complex tier if no classification."""
       router = ModelRouter()
       request = ChatCompletionRequest(messages=[Message(role="user", content="test")])
       
       model, reason = router.select_model(None, request)
       
       # Should default to complex tier (safe fallback)
       assert model is not None
       assert "default" in reason.lower() or "no classification" in reason.lower()
   
   
   def test_cost_estimation():
       """Test cost estimation for known models."""
       router = ModelRouter()
       
       # gpt-4o-mini should be cheaper than gpt-4o
       mini_cost = router.estimate_cost("gpt-4o-mini", 1000, 500)
       standard_cost = router.estimate_cost("gpt-4o", 1000, 500)
       
       assert mini_cost > 0
       assert standard_cost > mini_cost
   
   
   def test_format_model_name():
       """Test model name formatting for LiteLLM."""
       from frugal_code.config import ModelConfig
       router = ModelRouter()
       
       # OpenAI model - no prefix
       openai_model = ModelConfig(name="gpt-4o", provider="openai")
       assert router._format_model_name(openai_model) == "gpt-4o"
       
       # Anthropic model - with prefix
       anthropic_model = ModelConfig(name="claude-3-sonnet", provider="anthropic")
       assert router._format_model_name(anthropic_model) == "anthropic/claude-3-sonnet"
   ```

2. `tests/test_integration.py` - End-to-end integration test
   ```python
   import pytest
   from unittest.mock import AsyncMock, patch, MagicMock
   
   
   @pytest.mark.asyncio
   async def test_full_pipeline_simple_request(client):
       """Test full pipeline: classify → route → call LLM for simple request."""
       mock_response = MagicMock()
       mock_response.id = "test-123"
       mock_response.created = 123456
       mock_response.model = "gpt-4o-mini"
       mock_response.usage.prompt_tokens = 5
       mock_response.usage.completion_tokens = 3
       mock_response.usage.total_tokens = 8
       mock_choice = MagicMock()
       mock_choice.index = 0
       mock_choice.message.role = "assistant"
       mock_choice.message.content = "Hi"
       mock_choice.finish_reason = "stop"
       mock_response.choices = [mock_choice]
       
       with patch("frugal_code.api.chat.acompletion", new_callable=AsyncMock, return_value=mock_response):
           response = client.post("/v1/chat/completions", json={
               "messages": [{"role": "user", "content": "What is 2+2?"}]
           })
       
       assert response.status_code == 200
       data = response.json()
       # Should have routed to simple model
       assert "mini" in data["model"].lower() or "haiku" in data["model"].lower()
   
   
   @pytest.mark.asyncio
   async def test_full_pipeline_complex_request(client):
       """Test full pipeline for complex request."""
       mock_response = MagicMock()
       mock_response.id = "test-456"
       mock_response.created = 123456
       mock_response.model = "gpt-4o"
       mock_response.usage.prompt_tokens = 100
       mock_response.usage.completion_tokens = 50
       mock_response.usage.total_tokens = 150
       mock_choice = MagicMock()
       mock_choice.index = 0
       mock_choice.message.role = "assistant"
       mock_choice.message.content = "Detailed analysis..."
       mock_choice.finish_reason = "stop"
       mock_response.choices = [mock_choice]
       
       long_prompt = "Analyze and explain in detail the comprehensive architecture " * 20
       
       with patch("frugal_code.api.chat.acompletion", new_callable=AsyncMock, return_value=mock_response):
           response = client.post("/v1/chat/completions", json={
               "messages": [{"role": "user", "content": long_prompt}]
           })
       
       assert response.status_code == 200
       # Should have routed to complex model
   ```

**Implementation Steps:**

1. Write `tests/test_router.py` with failing tests
2. Run: `pytest tests/test_router.py` → verify failures
3. Implement `src/frugal_code/router.py`
4. Run: `pytest tests/test_router.py` → verify passes
5. Write `tests/test_integration.py` with failing tests
6. Modify `src/frugal_code/api/chat.py` to integrate classifier + router
7. Run: `pytest tests/test_integration.py` → verify passes
8. Run full test suite: `pytest` → all pass
9. Manual test with real API:
   - Simple: `curl ... -d '{"messages": [{"role": "user", "content": "Hi"}]}'`
   - Complex: `curl ... -d '{"messages": [{"role": "user", "content": "Analyze..."}]}'`
   - Check logs to see routing decisions
10. Test override: `curl ... -d '{"model": "gpt-4o", "messages": [...]}'`

**Acceptance Criteria:**

- [ ] All tests pass: `pytest` (28+ tests)
- [ ] Simple requests route to gpt-4o-mini (or configured simple model)
- [ ] Complex requests route to gpt-4o (or configured complex model)
- [ ] Client can override by specifying `model` in request
- [ ] Routing reason is logged/visible
- [ ] Cost estimation function works for common models
- [ ] Router handles missing configuration gracefully (fallback)
- [ ] Router supports priority-based selection
- [ ] No linter errors

**Dependencies:** Requires Phase 1 (config), Phase 2 (API), Phase 3 (classifier)

---

### Phase 5: OpenTelemetry Instrumentation

**Objective:** Add full OpenTelemetry instrumentation with GenAI semantic conventions, custom Frugal-AI attributes, and OTLP export to Jaeger.

**Estimated Time:** 120-180 minutes

**Files to Create:**

- `src/frugal_code/telemetry.py` - OTel initialization and helpers
  ```python
  from contextlib import contextmanager
  from opentelemetry import trace
  from opentelemetry.sdk.trace import TracerProvider
  from opentelemetry.sdk.trace.export import BatchSpanProcessor
  from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
  from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
  from opentelemetry.sdk.resources import Resource, SERVICE_NAME
  from opentelemetry.trace import Status, StatusCode
  from .config import settings
  
  
  def setup_telemetry():
      """
      Initialize OpenTelemetry tracing.
      
      - Creates TracerProvider with service name
      - Configures OTLP exporter (Jaeger, Tempo, etc.)
      - Sets up FastAPI auto-instrumentation
      """
      if not settings.otel_enabled:
          print("⚠️  OpenTelemetry disabled")
          return
      
      # Create resource with service name
      resource = Resource(attributes={
          SERVICE_NAME: settings.service_name,
      })
      
      # Create tracer provider
      provider = TracerProvider(resource=resource)
      
      # Configure OTLP exporter
      otlp_exporter = OTLPSpanExporter(
          endpoint=settings.otel_exporter_otlp_endpoint,
          insecure=True,  # Use TLS in production
      )
      
      # Add span processor
      provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
      
      # Set as global tracer provider
      trace.set_tracer_provider(provider)
      
      print(f"✅ OpenTelemetry initialized: {settings.otel_exporter_otlp_endpoint}")
  
  
  def instrument_fastapi(app):
      """Instrument FastAPI app for auto-tracing."""
      if settings.otel_enabled:
          FastAPIInstrumentor.instrument_app(app)
          print("✅ FastAPI instrumented")
  
  
  # Get tracer for manual spans
  tracer = trace.get_tracer(__name__)
  
  
  @contextmanager
  def trace_classification():
      """Context manager for classification span."""
      with tracer.start_as_current_span("frugal.classify") as span:
          try:
              yield span
          except Exception as e:
              span.set_status(Status(StatusCode.ERROR, str(e)))
              span.record_exception(e)
              raise
  
  
  @contextmanager
  def trace_completion(model: str):
      """Context manager for completion span with GenAI semconv."""
      with tracer.start_as_current_span("gen_ai.chat") as span:
          # GenAI semantic conventions
          span.set_attribute("gen_ai.system", model.split("/")[0] if "/" in model else "openai")
          span.set_attribute("gen_ai.request.model", model)
          
          try:
              yield span
          except Exception as e:
              span.set_status(Status(StatusCode.ERROR, str(e)))
              span.record_exception(e)
              raise
  
  
  def add_classification_attributes(span, classification):
      """Add Frugal-AI classification attributes to span."""
      span.set_attribute("frugal.complexity_tier", classification.tier.value)
      span.set_attribute("frugal.complexity_score", classification.score)
      span.set_attribute("frugal.classifier_type", classification.classifier_type)
      span.set_attribute("frugal.classification_reason", classification.reason)
  
  
  def add_completion_attributes(span, model: str, usage, estimated_cost: float, estimated_savings: float):
      """Add GenAI and Frugal attributes to completion span."""
      # GenAI semantic conventions
      span.set_attribute("gen_ai.response.model", model)
      span.set_attribute("gen_ai.usage.input_tokens", usage.prompt_tokens)
      span.set_attribute("gen_ai.usage.output_tokens", usage.completion_tokens)
      
      # Frugal-specific
      span.set_attribute("frugal.routed_model", model)
      span.set_attribute("frugal.estimated_cost_cents", round(estimated_cost, 4))
      span.set_attribute("frugal.estimated_savings_cents", round(estimated_savings, 4))
  ```

- `docker-compose.yml` - Jaeger for local telemetry testing
  ```yaml
  version: '3.8'
  
  services:
    jaeger:
      image: jaegertracing/all-in-one:latest
      ports:
        - "16686:16686"  # Jaeger UI
        - "4317:4317"    # OTLP gRPC
        - "4318:4318"    # OTLP HTTP
      environment:
        - COLLECTOR_OTLP_ENABLED=true
  
    frugal-ai:
      build: .
      ports:
        - "8000:8000"
      environment:
        - OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317
        - OTEL_ENABLED=true
        - OPENAI_API_KEY=${OPENAI_API_KEY}
      depends_on:
        - jaeger
      volumes:
        - ./data:/app/data
  ```

- `Dockerfile` - Container image
  ```dockerfile
  FROM python:3.12-slim
  
  WORKDIR /app
  
  # Install dependencies
  COPY pyproject.toml .
  RUN pip install --no-cache-dir -e .
  
  # Copy source
  COPY src/ src/
  
  # Create data directory
  RUN mkdir -p data
  
  # Expose port
  EXPOSE 8000
  
  # Run server
  CMD ["uvicorn", "frugal_code.main:app", "--host", "0.0.0.0", "--port", "8000"]
  ```

**Files to Modify:**

- `src/frugal_code/main.py` - Initialize OTel in lifespan
  ```python
  # Add imports:
  from .telemetry import setup_telemetry, instrument_fastapi
  
  # Modify lifespan:
  @asynccontextmanager
  async def lifespan(app: FastAPI):
      """Application lifespan: startup and shutdown."""
      # Startup
      print(f"🚀 Starting {settings.service_name} on {settings.host}:{settings.port}")
      
      # Initialize OpenTelemetry
      setup_telemetry()
      
      yield
      
      # Shutdown (flush spans)
      from opentelemetry import trace
      if settings.otel_enabled:
          trace.get_tracer_provider().shutdown()
      print("👋 Shutting down...")
  
  # After app creation, instrument FastAPI:
  instrument_fastapi(app)
  ```

- `src/frugal_code/api/chat.py` - Add tracing spans
  ```python
  # Add import:
  from ..telemetry import (
      trace_classification,
      trace_completion,
      add_classification_attributes,
      add_completion_attributes,
  )
  from opentelemetry import trace
  
  # Modify chat_completions:
  @router.post("/v1/chat/completions")
  async def chat_completions(request: ChatCompletionRequest):
      """..."""
      classification = None
      routing_reason = ""
      
      # Get current span to add attributes
      current_span = trace.get_current_span()
      
      # Classification with tracing
      if not request.model:
          with trace_classification() as classify_span:
              classification = await classifier.classify(request)
              add_classification_attributes(classify_span, classification)
      
      # Routing
      model, routing_reason = model_router.select_model(classification, request)
      
      if classification:
          current_span.set_attribute("frugal.original_model", request.model or "none")
      
      try:
          # Completion with tracing
          with trace_completion(model) as completion_span:
              if request.stream:
                  # Streaming - return immediately, spans closed in stream handler
                  return EventSourceResponse(stream_completion(request, model, classification))
              
              # Non-streaming
              response = await acompletion(...)
              
              # Add telemetry attributes
              estimated_cost = model_router.estimate_cost(
                  model,
                  response.usage.prompt_tokens,
                  response.usage.completion_tokens,
              )
              
              # Estimate savings (vs always using gpt-4o)
              max_cost = model_router.estimate_cost(
                  "gpt-4o",
                  response.usage.prompt_tokens,
                  response.usage.completion_tokens,
              )
              estimated_savings = max(0, max_cost - estimated_cost)
              
              add_completion_attributes(
                  completion_span,
                  model,
                  response.usage,
                  estimated_cost,
                  estimated_savings,
              )
              
              return ChatCompletionResponse(...)
      
      except Exception as e:
          current_span.set_status(Status(StatusCode.ERROR, str(e)))
          raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")
  ```

**Tests to Write First (TDD):**

1. `tests/test_telemetry.py` - OTel setup tests
   ```python
   import pytest
   from unittest.mock import patch, MagicMock
   
   
   def test_setup_telemetry_when_enabled():
       """Test OTel setup when enabled."""
       with patch("frugal_code.telemetry.settings") as mock_settings:
           mock_settings.otel_enabled = True
           mock_settings.service_name = "test-service"
           mock_settings.otel_exporter_otlp_endpoint = "http://localhost:4317"
           
           with patch("frugal_code.telemetry.trace.set_tracer_provider"):
               from frugal_code.telemetry import setup_telemetry
               setup_telemetry()
               # Should not raise
   
   
   def test_setup_telemetry_when_disabled():
       """Test OTel setup when disabled."""
       with patch("frugal_code.telemetry.settings") as mock_settings:
           mock_settings.otel_enabled = False
           
           from frugal_code.telemetry import setup_telemetry
           setup_telemetry()
           # Should return early without error
   
   
   def test_trace_classification_context_manager():
       """Test classification span context manager."""
       from frugal_code.telemetry import trace_classification
       
       # Should create span (even if not exported in tests)
       with trace_classification() as span:
           assert span is not None
   
   
   def test_add_classification_attributes():
       """Test adding classification attributes to span."""
       from frugal_code.telemetry import add_classification_attributes
       from frugal_code.classifier.base import ClassificationResult
       from frugal_code.config import ComplexityTier
       
       mock_span = MagicMock()
       classification = ClassificationResult(
           tier=ComplexityTier.SIMPLE,
           score=0.3,
           reason="Test",
           classifier_type="test",
       )
       
       add_classification_attributes(mock_span, classification)
       
       # Verify attributes were set
       assert mock_span.set_attribute.call_count >= 4
   ```

2. `tests/test_api.py` - Add test for tracing in endpoint
   ```python
   @pytest.mark.asyncio
   async def test_endpoint_creates_spans(client):
       """Test that endpoint creates OTel spans."""
       # This is integration-level; we'll verify spans aren't causing errors
       with patch("frugal_code.api.chat.acompletion", new_callable=AsyncMock) as mock_completion:
           mock_response = MagicMock()
           mock_response.id = "test"
           mock_response.created = 123
           mock_response.model = "gpt-4o-mini"
           mock_response.usage.prompt_tokens = 5
           mock_response.usage.completion_tokens = 3
           mock_response.usage.total_tokens = 8
           mock_choice = MagicMock()
           mock_choice.index = 0
           mock_choice.message.role = "assistant"
           mock_choice.message.content = "Hi"
           mock_choice.finish_reason = "stop"
           mock_response.choices = [mock_choice]
           mock_completion.return_value = mock_response
           
           response = client.post("/v1/chat/completions", json={
               "messages": [{"role": "user", "content": "test"}]
           })
           
           assert response.status_code == 200
           # If OTel is configured, spans would be created (not visible in test)
   ```

**Implementation Steps:**

1. Write `tests/test_telemetry.py` with tests
2. Run: `pytest tests/test_telemetry.py` → may fail
3. Implement `src/frugal_code/telemetry.py`
4. Run: `pytest tests/test_telemetry.py` → passes
5. Modify `src/frugal_code/main.py` to call setup_telemetry()
6. Modify `src/frugal_code/api/chat.py` to add spans
7. Run full test suite: `pytest` → all pass
8. Create `Dockerfile` and `docker-compose.yml`
9. Test with Docker:
   ```bash
   docker-compose up -d jaeger
   # Wait for Jaeger
   uvicorn frugal_code.main:app --reload
   ```
10. Make test requests to generate traces
11. Open Jaeger UI: http://localhost:16686
12. Verify traces appear with:
    - HTTP span (auto-instrumented)
    - `frugal.classify` span
    - `gen_ai.chat` span
    - Custom attributes visible
13. Test full Docker build:
    ```bash
    docker-compose build
    docker-compose up
    ```

**Acceptance Criteria:**

- [ ] All tests pass: `pytest` (33+ tests)
- [ ] OTel initializes correctly when enabled
- [ ] FastAPI requests auto-create HTTP spans
- [ ] Classification creates `frugal.classify` span
- [ ] LLM calls create `gen_ai.chat` span
- [ ] GenAI semconv attributes present (gen_ai.system, gen_ai.usage.*)
- [ ] Frugal attributes present (frugal.complexity_tier, frugal.estimated_cost, etc.)
- [ ] Spans visible in Jaeger UI (http://localhost:16686)
- [ ] docker-compose successfully runs proxy + Jaeger
- [ ] Dockerfile builds and runs correctly
- [ ] No linter errors

**Dependencies:** Requires Phase 1-4 complete

---

### Phase 6: Feedback System

**Objective:** Implement user feedback collection endpoint (`POST /v1/feedback`) with SQLite storage for rating responses and providing complexity overrides.

**Estimated Time:** 90-120 minutes

**Files to Create:**

- `src/frugal_code/feedback/__init__.py` - Feedback package
  ```python
  from .api import router as feedback_router
  from .models import FeedbackRequest, FeedbackResponse
  
  __all__ = ["feedback_router", "FeedbackRequest", "FeedbackResponse"]
  ```

- `src/frugal_code/feedback/models.py` - Feedback data models
  ```python
  from datetime import datetime
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
      created_at: str  # ISO format timestamp
  
  
  class FeedbackDB:
      """SQLite schema for feedback (via aiosqlite)."""
      
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
  ```

- `src/frugal_code/feedback/repository.py` - Database operations
  ```python
  import aiosqlite
  from pathlib import Path
  from datetime import datetime, timezone
  from typing import List
  from .models import FeedbackRequest, FeedbackResponse, FeedbackDB
  
  
  class FeedbackRepository:
      """Repository for feedback persistence."""
      
      def __init__(self, db_path: str):
          """Initialize repository with database path."""
          self.db_path = db_path
          # Ensure parent directory exists
          Path(db_path).parent.mkdir(parents=True, exist_ok=True)
      
      async def initialize(self):
          """Initialize database schema."""
          async with aiosqlite.connect(self.db_path) as db:
              await db.execute(FeedbackDB.CREATE_TABLE_SQL)
              await db.execute(FeedbackDB.CREATE_INDEX_SQL)
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
              complexity_override=feedback.complexity_override.value if feedback.complexity_override else None,
              created_at=created_at,
          )
      
      async def get_feedback(self, limit: int = 100, offset: int = 0) -> List[FeedbackResponse]:
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
      
      async def get_feedback_by_request(self, request_id: str) -> List[FeedbackResponse]:
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
  ```

- `src/frugal_code/feedback/api.py` - Feedback API endpoints
  ```python
  from fastapi import APIRouter, HTTPException
  from typing import List
  from .models import FeedbackRequest, FeedbackResponse
  from .repository import FeedbackRepository
  from ..config import settings
  
  router = APIRouter()
  
  # Initialize repository
  feedback_repo = FeedbackRepository(settings.feedback_db_path)
  
  
  @router.on_event("startup")
  async def initialize_feedback_db():
      """Initialize feedback database on startup."""
      await feedback_repo.initialize()
      print(f"✅ Feedback database initialized: {settings.feedback_db_path}")
  
  
  @router.post("/v1/feedback", response_model=FeedbackResponse, status_code=201)
  async def submit_feedback(feedback: FeedbackRequest):
      """
      Submit feedback on a chat completion response.
      
      Allows users to rate responses and optionally suggest a different complexity tier.
      """
      try:
          result = await feedback_repo.create_feedback(feedback)
          return result
      except Exception as e:
          raise HTTPException(status_code=500, detail=f"Failed to store feedback: {str(e)}")
  
  
  @router.get("/v1/feedback", response_model=List[FeedbackResponse])
  async def get_feedback(limit: int = 100, offset: int = 0):
      """
      Retrieve feedback entries with pagination.
      
      Args:
          limit: Maximum number of entries to return (default 100)
          offset: Number of entries to skip (default 0)
      """
      try:
          results = await feedback_repo.get_feedback(limit=limit, offset=offset)
          return results
      except Exception as e:
          raise HTTPException(status_code=500, detail=f"Failed to retrieve feedback: {str(e)}")
  
  
  @router.get("/v1/feedback/{request_id}", response_model=List[FeedbackResponse])
  async def get_feedback_for_request(request_id: str):
      """Get all feedback for a specific request ID."""
      try:
          results = await feedback_repo.get_feedback_by_request(request_id)
          return results
      except Exception as e:
          raise HTTPException(status_code=500, detail=f"Failed to retrieve feedback: {str(e)}")
  ```

**Files to Modify:**

- `src/frugal_code/main.py` - Register feedback router
  ```python
  # Add import:
  from .feedback import feedback_router
  
  # Register router (after chat_router):
  app.include_router(feedback_router)
  ```

- `src/frugal_code/api/chat.py` - Include request_id in response (for feedback)
  ```python
  # In ChatCompletionResponse, the `id` field is already present
  # Users can use this as request_id for feedback
  # Just ensure it's consistently set (already done via uuid generation)
  ```

**Tests to Write First (TDD):**

1. `tests/test_feedback.py` - Feedback system tests
   ```python
   import pytest
   import os
   from frugal_code.feedback.repository import FeedbackRepository
   from frugal_code.feedback.models import FeedbackRequest
   from frugal_code.config import ComplexityTier
   
   
   @pytest.fixture
   async def feedback_repo():
       """Create a test feedback repository."""
       db_path = "/tmp/test_feedback.db"
       if os.path.exists(db_path):
           os.remove(db_path)
       
       repo = FeedbackRepository(db_path)
       await repo.initialize()
       
       yield repo
       
       # Cleanup
       if os.path.exists(db_path):
           os.remove(db_path)
   
   
   @pytest.mark.asyncio
   async def test_create_feedback(feedback_repo):
       """Test creating feedback entry."""
       feedback = FeedbackRequest(
           request_id="test-123",
           rating=5,
           comment="Great response!",
           complexity_override=ComplexityTier.SIMPLE,
       )
       
       result = await feedback_repo.create_feedback(feedback)
       
       assert result.id > 0
       assert result.request_id == "test-123"
       assert result.rating == 5
       assert result.comment == "Great response!"
       assert result.complexity_override == "simple"
   
   
   @pytest.mark.asyncio
   async def test_get_feedback(feedback_repo):
       """Test retrieving feedback entries."""
       # Create multiple feedback entries
       for i in range(3):
           await feedback_repo.create_feedback(FeedbackRequest(
               request_id=f"req-{i}",
               rating=i + 1,
           ))
       
       results = await feedback_repo.get_feedback(limit=10)
       
       assert len(results) == 3
       # Should be ordered by created_at DESC
       assert results[0].request_id == "req-2"
   
   
   @pytest.mark.asyncio
   async def test_get_feedback_by_request(feedback_repo):
       """Test retrieving feedback for specific request."""
       # Create feedback for different requests
       await feedback_repo.create_feedback(FeedbackRequest(request_id="req-1", rating=4))
       await feedback_repo.create_feedback(FeedbackRequest(request_id="req-1", rating=5))
       await feedback_repo.create_feedback(FeedbackRequest(request_id="req-2", rating=3))
       
       results = await feedback_repo.get_feedback_by_request("req-1")
       
       assert len(results) == 2
       assert all(r.request_id == "req-1" for r in results)
   
   
   @pytest.mark.asyncio
   async def test_feedback_validation():
       """Test feedback request validation."""
       from pydantic import ValidationError
       
       # Valid
       valid = FeedbackRequest(request_id="test", rating=3)
       assert valid.rating == 3
       
       # Invalid rating
       with pytest.raises(ValidationError):
           FeedbackRequest(request_id="test", rating=6)  # Max is 5
       
       with pytest.raises(ValidationError):
           FeedbackRequest(request_id="test", rating=0)  # Min is 1
   
   
   def test_feedback_api_submit(client):
       """Test POST /v1/feedback endpoint."""
       response = client.post("/v1/feedback", json={
           "request_id": "chatcmpl-test123",
           "rating": 5,
           "comment": "Excellent!",
       })
       
       assert response.status_code == 201
       data = response.json()
       assert data["request_id"] == "chatcmpl-test123"
       assert data["rating"] == 5
       assert "id" in data
       assert "created_at" in data
   
   
   def test_feedback_api_get(client):
       """Test GET /v1/feedback endpoint."""
       # Submit some feedback first
       client.post("/v1/feedback", json={"request_id": "test1", "rating": 4})
       client.post("/v1/feedback", json={"request_id": "test2", "rating": 5})
       
       response = client.get("/v1/feedback")
       
       assert response.status_code == 200
       data = response.json()
       assert isinstance(data, list)
       assert len(data) >= 2
   
   
   def test_feedback_api_get_by_request(client):
       """Test GET /v1/feedback/{request_id} endpoint."""
       # Submit feedback
       client.post("/v1/feedback", json={"request_id": "specific-123", "rating": 3})
       
       response = client.get("/v1/feedback/specific-123")
       
       assert response.status_code == 200
       data = response.json()
       assert isinstance(data, list)
       assert len(data) >= 1
       assert data[0]["request_id"] == "specific-123"
   ```

**Implementation Steps:**

1. Write `tests/test_feedback.py` with failing tests
2. Run: `pytest tests/test_feedback.py` → verify failures
3. Create `src/frugal_code/feedback/models.py`
4. Create `src/frugal_code/feedback/repository.py`
5. Run: `pytest tests/test_feedback.py -k repository` → test repo
6. Create `src/frugal_code/feedback/api.py`
7. Create `src/frugal_code/feedback/__init__.py`
8. Modify `src/frugal_code/main.py` to register router
9. Run: `pytest tests/test_feedback.py` → all pass
10. Run full test suite: `pytest` → all pass
11. Manual test:
    ```bash
    # Submit feedback
    curl -X POST http://localhost:8000/v1/feedback \
      -H "Content-Type: application/json" \
      -d '{"request_id": "test-123", "rating": 5, "comment": "Great!"}'
    
    # Get all feedback
    curl http://localhost:8000/v1/feedback
    
    # Get feedback for specific request
    curl http://localhost:8000/v1/feedback/test-123
    ```
12. Verify SQLite database created at `data/feedback.db`
13. Verify data persists across server restarts

**Acceptance Criteria:**

- [ ] All tests pass: `pytest` (43+ tests)
- [ ] POST `/v1/feedback` accepts and stores feedback
- [ ] GET `/v1/feedback` returns paginated feedback list
- [ ] GET `/v1/feedback/{request_id}` returns feedback for specific request
- [ ] SQLite database initialized on startup
- [ ] Feedback schema includes all required fields
- [ ] Rating validation enforces 1-5 range
- [ ] Timestamps stored in ISO format
- [ ] Pagination works correctly
- [ ] Database survives server restart
- [ ] No linter errors

**Dependencies:** Requires Phase 1 (config) complete

---

## Technical Decisions

**Decision 1: LiteLLM vs Direct Provider SDKs**
- **Options Considered:**
  - A) LiteLLM unified interface
  - B) Direct OpenAI/Anthropic SDKs
  - C) LangChain
- **Chosen:** LiteLLM
- **Rationale:** Single API supports 100+ providers, reduces complexity, handles retries/errors, well-documented
- **Trade-offs:** Adds dependency, but massive time savings on multi-provider support

**Decision 2: Heuristic vs LLM Classification**
- **Options Considered:**
  - A) Heuristic-based (token count, keywords)
  - B) LLM-based routing (meta-LLM call)
  - C) ML classifier (fine-tuned)
- **Chosen:** Heuristic first, with pluggable architecture
- **Rationale:** Zero cost, <1ms latency, good enough for demo. Abstract interface allows upgrades.
- **Trade-offs:** Less accurate than ML, but fast and deterministic

**Decision 3: SQLite vs PostgreSQL for Feedback**
- **Options Considered:**
  - A) SQLite (aiosqlite)
  - B) PostgreSQL
  - C) In-memory only
- **Chosen:** SQLite
- **Rationale:** Zero setup, perfect for demo/hackathon, sufficient for moderate scale
- **Trade-offs:** Single-writer limitation, but fine for feedback workload

**Decision 4: Jaeger vs Grafana+Tempo**
- **Options Considered:**
  - A) Jaeger all-in-one
  - B) Grafana + Tempo
  - C) Datadog/commercial
- **Chosen:** Jaeger for demo, OTLP compatible with Grafana+Tempo
- **Rationale:** Jaeger is easiest for local testing. OTLP standard means easy swap.
- **Trade-offs:** Jaeger less production-ready, but perfect for demo

---

## Open Questions (Requires User Input)

None at this time — all key decisions resolved per context.

---

## Risks and Mitigation

| Risk                            | Likelihood | Impact | Mitigation                                                        |
| ------------------------------- | ---------- | ------ | ----------------------------------------------------------------- |
| LiteLLM API changes             | Low        | Medium | Pin version in pyproject.toml                                     |
| Classification accuracy too low | Medium     | High   | Log all classifications for analysis; collect feedback for tuning |
| Token counting inaccurate       | Medium     | Low    | Use tiktoken (same as OpenAI); accept minor variance              |
| Streaming + OTel spans complex  | Medium     | Medium | Test thoroughly; span finalized after stream completes            |
| API key leakage in logs/traces  | Low        | High   | Never log API keys; sanitize trace attributes                     |
| SQLite write contention         | Low        | Low    | Feedback is low-volume; connection pooling if needed              |

---

## Success Metrics

- **Functional:**
  - All 43+ tests pass
  - OpenAI-compatible API works with existing clients
  - Classification accuracy >80% on test cases
  - Streaming works smoothly
- **Performance:**
  - Classification adds <10ms overhead
  - End-to-end latency comparable to direct provider call
- **Observability:**
  - Every request produces complete trace in Jaeger
  - GenAI semconv attributes visible
  - Cost/savings estimates accurate within 10%
- **Demo Quality:**
  - Docker Compose runs system in <1 minute
  - Jaeger UI shows clear routing decisions
  - Feedback endpoint collects data for analysis

---

## Future Enhancements (Out of Scope)

- **LLM-based classifier** - Use GPT-4o-mini as meta-router (200-500ms overhead)
- **ML classifier** - Fine-tuned sentence-transformer (near-zero latency)
- **MEDIUM complexity tier** - Three-tier routing with medium models
- **Caching layer** - Redis cache for repeated prompts
- **Rate limiting** - Per-client rate limits
- **Authentication** - API key management
- **Cost tracking dashboard** - Grafana dashboard for cost/savings visualization
- **A/B testing** - Compare classification strategies
- **Feedback-driven tuning** - Train classifier from user feedback
- **Tool/function calling** - Support OpenAI function calling API
- **Prompt templates** - Reusable prompt patterns

---

## References

- [LiteLLM Documentation](https://docs.litellm.ai/)
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)

---

**Plan Ready for Implementation** ✅

Next step: Begin Phase 1 with `vinex_implementer` or implement manually following the detailed steps.
