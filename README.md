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
