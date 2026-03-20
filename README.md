# Frugal-AI

A complexity-aware LLM proxy that classifies prompt complexity and routes to the cheapest/smallest model capable of handling the request — reducing cost, latency, and carbon footprint.

## How It Works

1. Client sends an OpenAI-compatible `POST /v1/chat/completions` request
2. The **classifier** analyzes prompt complexity (token count, code blocks, keywords, conversation length)
3. The **router** maps the complexity tier to a model (simple → cheap model, complex → powerful model)
4. The request is forwarded to the selected LLM via [LiteLLM](https://docs.litellm.ai/)
5. OpenTelemetry traces capture classification decisions, model usage, and cost savings

## Quick Start

### Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) package manager
- Access to the Ollama instance at `172.26.32.29:11434` (or configure your own)

### Install

```bash
uv sync
```

### Configure

Copy and edit the environment file:

```bash
cp .env.example .env
# Edit .env with your settings (Ollama URL, API keys, etc.)
```

Default configuration uses Ollama models:
- **Simple tier**: `glm-4.7-flash` (fast, lightweight)
- **Complex tier**: `qwen3.5:35b` (powerful, 35B params)

### Run the Dev Server

```bash
uv run uvicorn frugal_code.main:app --reload --port 8000
```

This starts the server with **live reload** — any code changes in `src/` are automatically picked up.

Options:
- `--reload` — enable auto-reload on file changes (dev mode)
- `--port 8000` — port to listen on (default: 8000)
- `--host 0.0.0.0` — bind to all interfaces (for Docker/remote access)

### Test It

Send a simple request:

```bash
curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "What is 2+2?"}]}' | python -m json.tool
```

Send a complex request (should route to the larger model):

```bash
curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Analyze and explain in detail the step by step architectural differences between microservices and monolithic applications. Write comprehensive code examples."}]}' | python -m json.tool
```

Test streaming:

```bash
curl -N http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Count to 5"}], "stream": true}'
```

Submit feedback:

```bash
curl -s http://localhost:8000/v1/feedback \
  -H "Content-Type: application/json" \
  -d '{"request_id": "chatcmpl-xxx", "rating": 5, "comment": "Great!"}' | python -m json.tool
```

## Running Tests

### Unit Tests (no server needed)

```bash
uv run pytest -v
```

### E2E Tests (requires running server + Ollama)

Start the server first, then in another terminal:

```bash
uv run pytest tests/test_e2e.py -v -s
```

### Lint

```bash
uv run ruff check src tests
```

## API Endpoints

| Method | Path                        | Description                         |
| ------ | --------------------------- | ----------------------------------- |
| `GET`  | `/health`                   | Health check                        |
| `POST` | `/v1/chat/completions`      | OpenAI-compatible chat completions  |
| `POST` | `/v1/feedback`              | Submit feedback on a response       |
| `GET`  | `/v1/feedback`              | List all feedback (paginated)       |
| `GET`  | `/v1/feedback/{request_id}` | Get feedback for a specific request |

### OpenAPI / Swagger

Interactive API docs are available when the server is running:

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **OpenAPI JSON**: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)

---

## Curl Examples

### Chat Completions

#### Simple question (auto-routed to cheap model)

```bash
curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is the capital of France?"}
    ]
  }' | python -m json.tool
```

**Response:**

```json
{
    "id": "chatcmpl-a1b2c3d4e5f6...",
    "object": "chat.completion",
    "created": 1774017000,
    "model": "ollama/glm-4.7-flash",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "The capital of France is Paris."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 14,
        "completion_tokens": 8,
        "total_tokens": 22
    }
}
```

#### Complex question (auto-routed to powerful model)

```bash
curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Analyze and explain in detail the step by step architectural differences between microservices and monolithic applications. Write comprehensive code examples in Python."}
    ]
  }' | python -m json.tool
```

#### With system message and temperature

```bash
curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful coding assistant."},
      {"role": "user", "content": "Write a Python function to reverse a string."}
    ],
    "temperature": 0.3,
    "max_tokens": 200
  }' | python -m json.tool
```

#### Multi-turn conversation

```bash
curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is Python?"},
      {"role": "assistant", "content": "Python is a high-level programming language."},
      {"role": "user", "content": "What are its main uses?"}
    ]
  }' | python -m json.tool
```

#### Force a specific model (bypass routing)

```bash
curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ollama/qwen3.5:35b",
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }' | python -m json.tool
```

#### Streaming response (Server-Sent Events)

```bash
curl -N http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Count from 1 to 5"}
    ],
    "stream": true
  }'
```

**Streamed output (one chunk per line):**

```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":1774017000,"model":"ollama/glm-4.7-flash","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":1774017000,"model":"ollama/glm-4.7-flash","choices":[{"index":0,"delta":{"content":"1"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":1774017000,"model":"ollama/glm-4.7-flash","choices":[{"index":0,"delta":{"content":", 2"},"finish_reason":null}]}

data: [DONE]
```

### Feedback

#### Submit feedback

```bash
curl -s http://localhost:8000/v1/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "chatcmpl-a1b2c3d4e5f6",
    "rating": 5,
    "comment": "Great response, fast and accurate!"
  }' | python -m json.tool
```

**Response (201 Created):**

```json
{
    "id": 1,
    "request_id": "chatcmpl-a1b2c3d4e5f6",
    "rating": 5,
    "comment": "Great response, fast and accurate!",
    "complexity_override": null,
    "created_at": "2026-03-20T15:30:00+00:00"
}
```

#### Submit feedback with complexity override

If you think the router chose the wrong tier, suggest a correction:

```bash
curl -s http://localhost:8000/v1/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "chatcmpl-a1b2c3d4e5f6",
    "rating": 2,
    "comment": "Response was too shallow, should have used a bigger model",
    "complexity_override": "complex"
  }' | python -m json.tool
```

#### List all feedback

```bash
curl -s "http://localhost:8000/v1/feedback?limit=10&offset=0" | python -m json.tool
```

**Response:**

```json
[
    {
        "id": 2,
        "request_id": "chatcmpl-a1b2c3d4e5f6",
        "rating": 2,
        "comment": "Response was too shallow, should have used a bigger model",
        "complexity_override": "complex",
        "created_at": "2026-03-20T15:35:00+00:00"
    },
    {
        "id": 1,
        "request_id": "chatcmpl-a1b2c3d4e5f6",
        "rating": 5,
        "comment": "Great response, fast and accurate!",
        "complexity_override": null,
        "created_at": "2026-03-20T15:30:00+00:00"
    }
]
```

#### Get feedback for a specific request

```bash
curl -s http://localhost:8000/v1/feedback/chatcmpl-a1b2c3d4e5f6 | python -m json.tool
```

### Health Check

```bash
curl -s http://localhost:8000/health | python -m json.tool
```

```json
{
    "status": "healthy",
    "service": "frugal-ai",
    "version": "0.1.0"
}
```

### OpenAPI Schema

```bash
curl -s http://localhost:8000/openapi.json | python -m json.tool
```

---

## Request / Response Reference

### Chat Completion Request Body

| Field               | Type               | Required | Default | Description                            |
| ------------------- | ------------------ | -------- | ------- | -------------------------------------- |
| `messages`          | `Message[]`        | **yes**  | —       | Conversation messages (at least 1)     |
| `model`             | `string \| null`   | no       | `null`  | Model name. If null, proxy auto-routes |
| `temperature`       | `float`            | no       | `1.0`   | Sampling temperature (0.0 – 2.0)       |
| `max_tokens`        | `int \| null`      | no       | `null`  | Max tokens to generate                 |
| `stream`            | `bool`             | no       | `false` | Stream response via SSE                |
| `top_p`             | `float`            | no       | `1.0`   | Nucleus sampling (0.0 – 1.0)           |
| `frequency_penalty` | `float`            | no       | `0.0`   | Frequency penalty (-2.0 – 2.0)         |
| `presence_penalty`  | `float`            | no       | `0.0`   | Presence penalty (-2.0 – 2.0)          |
| `stop`              | `string[] \| null` | no       | `null`  | Stop sequences                         |
| `user`              | `string \| null`   | no       | `null`  | User identifier (metadata only)        |

**Message object:**

| Field     | Type     | Required | Description                           |
| --------- | -------- | -------- | ------------------------------------- |
| `role`    | `string` | **yes**  | One of: `system`, `user`, `assistant` |
| `content` | `string` | **yes**  | Message content                       |

### Feedback Request Body

| Field                 | Type             | Required | Description                               |
| --------------------- | ---------------- | -------- | ----------------------------------------- |
| `request_id`          | `string`         | **yes**  | The `id` from a chat completion response  |
| `rating`              | `int`            | **yes**  | Rating 1–5                                |
| `comment`             | `string \| null` | no       | Optional text comment                     |
| `complexity_override` | `string \| null` | no       | Suggested tier: `"simple"` or `"complex"` |

## Configuration

All settings are configurable via environment variables or `.env` file:

| Variable                      | Default                     | Description                                |
| ----------------------------- | --------------------------- | ------------------------------------------ |
| `SERVICE_NAME`                | `frugal-ai`                 | Service name for telemetry                 |
| `HOST`                        | `0.0.0.0`                   | Server bind host                           |
| `PORT`                        | `8000`                      | Server port                                |
| `OLLAMA_BASE_URL`             | `http://172.26.32.29:11434` | Ollama instance URL                        |
| `OPENAI_API_KEY`              | —                           | OpenAI API key (if using OpenAI models)    |
| `ANTHROPIC_API_KEY`           | —                           | Anthropic API key (if using Claude models) |
| `OTEL_ENABLED`                | `false`                     | Enable OpenTelemetry tracing               |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317`     | OTLP collector endpoint                    |
| `FEEDBACK_DB_PATH`            | `data/feedback.db`          | SQLite database path                       |

## Project Structure

```
src/frugal_code/
├── main.py             # FastAPI app, lifespan
├── config.py           # Pydantic settings, model tiers
├── models.py           # OpenAI-compatible request/response models
├── router.py           # Complexity tier → model mapping
├── telemetry.py        # OpenTelemetry setup, GenAI spans
├── api/
│   └── chat.py         # POST /v1/chat/completions
├── classifier/
│   ├── base.py         # ABC for classifiers
│   └── heuristic.py    # Heuristic-based classifier
└── feedback/
    ├── api.py          # Feedback endpoints
    ├── models.py       # Feedback data models
    └── repository.py   # SQLite persistence
```

## Docker

```bash
docker compose up
```

This starts the proxy + Jaeger (for trace visualization at http://localhost:16686).

---

## FAQ

### How does the routing work?

When you send a request **without** a `model` field, the proxy runs a heuristic classifier that scores the prompt on:

- **Token count** — longer prompts score higher
- **Code blocks** — presence of ` ``` ` fenced blocks increases complexity
- **Keywords** — words like "analyze", "explain in detail", "step by step" push toward complex; words like "what is", "define" push toward simple
- **Conversation length** — many turns (5+) increase complexity
- **Structure** — lists, numbered items, multiple questions

If the score is ≥ 0.5, it routes to the **complex** tier; otherwise **simple**.

### Can I force a specific model?

Yes. Set the `model` field in your request and the proxy will use it directly, skipping classification:

```json
{"model": "ollama/qwen3.5:35b", "messages": [...]}
```

### How do I use it with the OpenAI Python SDK?

Point the SDK at the proxy:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="not-needed",  # no auth required
)

response = client.chat.completions.create(
    messages=[{"role": "user", "content": "What is 2+2?"}],
)
print(response.choices[0].message.content)
```

### How do I add a new model provider (e.g., OpenAI, Anthropic)?

Edit the `model_tiers` in your `.env` or in [src/frugal_code/config.py](src/frugal_code/config.py). Example adding OpenAI:

```python
model_tiers = {
    "simple": [
        {"name": "gpt-4o-mini", "provider": "openai", "priority": 1},
    ],
    "complex": [
        {"name": "gpt-4o", "provider": "openai", "priority": 1},
    ],
}
```

Make sure the corresponding API key is set (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

### How do I use a custom Ollama instance?

Set `OLLAMA_BASE_URL` in `.env` and configure the model tiers with `base_url`:

```env
OLLAMA_BASE_URL=http://my-server:11434
```

The default config already points model tiers to the Ollama URL. If you override with `model` in the request (e.g., `ollama/llama3`), the proxy uses `OLLAMA_BASE_URL` as the base.

### What models are available on the Ollama instance?

```bash
curl -s http://172.26.32.29:11434/api/tags | python -m json.tool
```

### How do I see the OpenAPI schema?

Start the server and visit:

- **Swagger UI** (interactive): [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc** (read-only): [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Raw JSON**: `curl http://localhost:8000/openapi.json`

### What is the feedback endpoint for?

It lets users rate responses (1–5) and optionally suggest that the router chose the wrong complexity tier. This data can later be used to tune the classifier.

```bash
# After a chat completion, use its "id" to submit feedback:
curl -s http://localhost:8000/v1/feedback \
  -H "Content-Type: application/json" \
  -d '{"request_id": "chatcmpl-abc123", "rating": 4}'
```

### How do I enable OpenTelemetry tracing?

Set in `.env`:

```env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

Then run a collector (Jaeger, Grafana Tempo, etc.) that accepts OTLP on that endpoint. The proxy emits spans with [GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) plus custom `frugal.*` attributes.

### Can I use this as a drop-in replacement for the OpenAI API?

Yes — any client that speaks the OpenAI Chat Completions API can point at `http://localhost:8000/v1` and it works. The proxy is compatible with:

- OpenAI Python/JS SDK
- LangChain
- LlamaIndex
- curl
- Any HTTP client

### How do I run tests?

```bash
# Unit tests (fast, no server needed)
uv run pytest -v

# E2E tests (requires running server + Ollama)
uv run pytest tests/test_e2e.py -v -s

# Lint
uv run ruff check src tests
```
