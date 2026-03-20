# Frugal-AI — Architecture Plan

## Vision

An AI proxy that classifies prompt complexity and routes to the cheapest/smallest model capable of handling the request — reducing cost, latency, and carbon footprint.

---

## Decision: Custom FastAPI + LiteLLM SDK (Option 1)

### Why NOT Open WebUI

Open WebUI is a **full chat UI application** (Svelte frontend + Python backend), not a proxy. Using it would mean:

- Fighting a large, opinionated codebase to inject classification/routing
- Carrying a heavy frontend you don't need (this is an API proxy, not a chat UI)
- Its extension model (pipelines/plugins) is for adding tools/functions, not for intercepting and rerouting requests
- OTel integration would need to be bolted on

**Verdict:** Open WebUI solves a different problem. It could be used *downstream* as a client that talks to the Frugal-AI proxy if a chat interface is wanted for the demo.

### Why Custom FastAPI + LiteLLM

|                           | Custom FastAPI + LiteLLM | LiteLLM Proxy Server         | Raw `openai` SDK     |
| ------------------------- | ------------------------ | ---------------------------- | -------------------- |
| Control over routing      | Full                     | Limited (plugin hooks)       | Full                 |
| OpenAI-compatible API     | You build thin layer     | Built-in                     | You build everything |
| Multi-provider support    | LiteLLM handles 100+     | Built-in                     | Manual per-provider  |
| OTel with GenAI semconv   | Full control             | Callback-based, less control | Full control         |
| Hackathon "we built this" | High                     | Low (configured, not built)  | High but slow        |
| Effort                    | Medium                   | Low-Medium                   | High                 |

**Winner: Custom FastAPI + LiteLLM SDK** — best balance of control, speed, and demo-ability.

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────────────────────────────────────┐     ┌──────────────┐
│   Client     │     │              Frugal-AI Proxy                 │     │  LLM Provider│
│ (any OpenAI  │────▶│                                              │────▶│  (OpenAI,    │
│  compatible  │     │  ┌───────────┐  ┌────────────┐  ┌────────┐  │     │  Anthropic,  │
│  client)     │◀────│  │ FastAPI   │─▶│ Classifier │─▶│ Router │  │     │  Ollama ...) │
│              │     │  │ Endpoint  │  │ (heuristic │  │ (model │  │     │              │
│              │     │  │ /v1/chat/ │  │  or LLM)   │  │ select)│  │     │              │
│              │     │  │completions│  └────────────┘  └────────┘  │     │              │
│              │     │  └───────────┘                               │     │              │
│              │     │        │           OTel Traces               │     │              │
│              │     └────────┼─────────────────────────────────────┘     └──────────────┘
│              │              │
│              │              ▼
│              │     ┌──────────────┐
│              │     │  OTel        │
│              │     │  Collector / │
│              │     │  Jaeger      │
│              │     └──────────────┘
```

### Request Flow

1. Client sends OpenAI-compatible `POST /v1/chat/completions`
2. FastAPI receives and validates the request (Pydantic models)
3. **Classifier** analyzes the prompt and assigns a complexity tier (simple / medium / complex)
4. **Router** maps the complexity tier to a concrete model (e.g., simple → `gpt-4o-mini`, complex → `gpt-4o`)
5. LiteLLM `completion()` forwards to the selected provider
6. Response is streamed back (SSE) or returned as JSON
7. **OTel spans** capture: classification decision, selected model, token usage, latency, cost

---

## Complexity Classification

### Tier Model

| Tier        | Description                                        | Example Models                              |
| ----------- | -------------------------------------------------- | ------------------------------------------- |
| **simple**  | Short questions, lookups, simple rewrites          | `gpt-4o-mini`, `claude-haiku`, local Ollama |
| **complex** | Multi-step reasoning, analysis, code gen, research | `gpt-4o`, `claude-sonnet`, `claude-opus`    |

> Start with 2 tiers. The classifier returns an enum; adding `medium` later is a one-line enum extension + config update.

### Classification Approaches (layered)

**1. Heuristic Classifier (default, zero-cost)**

Signals:
- Token/character count of the prompt
- Number of conversation turns
- Presence of code blocks, math, structured output requests
- Keyword patterns ("explain", "analyze", "write a full", "step by step")
- System prompt complexity
- JSON mode / tool-calling requests

**2. LLM Router (optional, ~200-500ms overhead)**

Use a cheap/fast model (e.g., `gpt-4o-mini`) to classify with a meta-prompt:
> "Classify this prompt's complexity as simple/medium/complex. Respond with one word."

Cost: ~50 input tokens + 1 output token per classification.

**3. ML Classifier (stretch goal)**

Fine-tune a small text classifier (sentence-transformers + logistic regression) on labeled prompt data. Near-zero latency, zero cost at inference.

### Strategy

Start with heuristics. Make classifiers pluggable (ABC base class) so LLM router and ML classifier can be swapped in.

---

## OpenTelemetry Integration

### GenAI Semantic Conventions

Use the [OpenTelemetry GenAI semconv](https://opentelemetry.io/docs/specs/semconv/gen-ai/) attributes:

| Attribute                    | Description                            |
| ---------------------------- | -------------------------------------- |
| `gen_ai.system`              | Provider (e.g., `openai`, `anthropic`) |
| `gen_ai.request.model`       | Requested model name                   |
| `gen_ai.response.model`      | Actual model used                      |
| `gen_ai.usage.input_tokens`  | Input token count                      |
| `gen_ai.usage.output_tokens` | Output token count                     |
| `gen_ai.request.temperature` | Temperature parameter                  |

### Custom Attributes (Frugal-AI specific)

| Attribute                  | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `frugal.complexity_tier`   | Classified tier (simple/medium/complex)              |
| `frugal.complexity_score`  | Numeric score from classifier                        |
| `frugal.classifier_type`   | Which classifier was used (heuristic/llm/ml)         |
| `frugal.original_model`    | Model the client requested (if any)                  |
| `frugal.routed_model`      | Model actually selected by router                    |
| `frugal.estimated_cost`    | Estimated cost of the request                        |
| `frugal.estimated_savings` | Estimated savings vs. always using the largest model |

### Trace Structure

```
[HTTP POST /v1/chat/completions]  ← auto-instrumented by FastAPI
  └─ [frugal.classify]            ← classification span
  └─ [gen_ai.chat]                ← LiteLLM completion span (GenAI semconv)
```

### Demo Stack

- **Jaeger** (all-in-one Docker image) for trace visualization
- OTLP exporter from the proxy → Jaeger
- Optional: Grafana + Tempo for prettier dashboards

---

## Project Structure

```
frugal-code/
├── pyproject.toml
├── README.md
├── docker-compose.yml          # App + Jaeger
├── Dockerfile
├── plans/
│   └── architecture.md
├── src/
│   └── frugal_code/
│       ├── __init__.py
│       ├── main.py             # FastAPI app, lifespan, OTel setup
│       ├── config.py           # Settings (model tiers, API keys, OTel endpoint)
│       ├── models.py           # Pydantic request/response models (OpenAI-compatible)
│       ├── api/
│       │   ├── __init__.py
│       │   └── chat.py         # POST /v1/chat/completions
│       ├── classifier/
│       │   ├── __init__.py
│       │   ├── base.py         # ABC for classifiers
│       │   ├── heuristic.py    # Heuristic-based classifier
│       │   └── llm_router.py   # LLM-based classifier (optional)
│       ├── router.py           # Complexity tier → model mapping
│       ├── telemetry.py        # OTel initialization, GenAI span helpers
│       └── feedback/
│           ├── __init__.py
│           ├── models.py       # Feedback Pydantic + SQLAlchemy models
│           ├── repository.py   # SQLite persistence (aiosqlite)
│           └── api.py          # POST /v1/feedback, GET /v1/feedback
└── tests/
    ├── __init__.py
    ├── test_classifier.py
    ├── test_router.py
    └── test_api.py
```

---

## Key Packages

| Package                                 | Purpose                                     |
| --------------------------------------- | ------------------------------------------- |
| `fastapi` + `uvicorn`                   | Async web framework + ASGI server           |
| `litellm`                               | Unified LLM interface, 100+ providers       |
| `opentelemetry-api`                     | OTel tracing API                            |
| `opentelemetry-sdk`                     | OTel tracing SDK                            |
| `opentelemetry-exporter-otlp`           | OTLP exporter (Jaeger/Tempo)                |
| `opentelemetry-instrumentation-fastapi` | Auto-instrument HTTP spans                  |
| `opentelemetry-semantic-conventions`    | GenAI semconv attributes                    |
| `pydantic` / `pydantic-settings`        | Config + request/response models            |
| `sse-starlette`                         | Server-Sent Events for streaming            |
| `tiktoken`                              | Token counting for heuristic classification |

---

## Implementation Phases

### Phase 1: Project Scaffolding

- `pyproject.toml` with all dependencies
- Project structure (`src/frugal_code/`)
- Config module (`pydantic-settings`)
- Basic FastAPI app with health endpoint

### Phase 2: OpenAI-Compatible API + LiteLLM Passthrough

- Pydantic models mirroring OpenAI chat completions API
- `POST /v1/chat/completions` endpoint
- LiteLLM `completion()` call (pass-through, no routing yet)
- Streaming (SSE) support
- Tests for the endpoint

### Phase 3: Complexity Classifier

- ABC base class for classifiers
- Heuristic classifier implementation
- Unit tests for classification
- Optional: LLM-based classifier

### Phase 4: Smart Router

- Complexity tier → model mapping (configurable)
- Integration: API → Classifier → Router → LiteLLM
- Override support (client can force a specific model)
- Tests for routing logic

### Phase 5: OpenTelemetry Instrumentation

- OTel SDK initialization in app lifespan
- FastAPI auto-instrumentation
- Custom spans for classification step
- GenAI semconv attributes on completion spans
- Custom Frugal-AI attributes (savings, tier, etc.)
- docker-compose with Jaeger

### Phase 6: Polish & Demo

- Dockerfile for the proxy
- docker-compose.yml (proxy + Jaeger)
- README with usage instructions
- Optional: simple dashboard / savings report endpoint

---

## Decisions (Resolved)

1. **Providers**: Flexible multi-provider via LiteLLM. OpenAI, Anthropic, OpenRouter, Ollama (custom URL), etc. All configurable.
2. **Complexity tiers**: Start with 2 (simple/complex). Extensible design so more tiers can be added later.
3. **UI**: Separate project. Proxy runs standalone. May prepare a simple UI later as a separate service.
4. **OTel backend**: Grafana + Tempo. Proxy exports to configurable OTLP targets — we don't bundle the backend.
5. **Auth**: Open for now (no API keys on the proxy).
6. **API surface**: Plain chat completions only. No tool/function calling for MVP.
7. **Feedback**: `POST /v1/feedback` endpoint to submit user feedback on responses. Stored in SQLite for quick setup.
