<p align="center">
  <img src="docs/images/cropped_circle_image.webp" alt="Frugal AI Router" width="160" />
</p>

# 🌿 Frugal AI Router

> An open-source proxy layer that intelligently routes AI requests to the most resource-appropriate model — saving compute, cost, and carbon.

---

## What is it?

The Frugal AI Router sits between your application and your AI providers. It analyzes every incoming request and decides: does this really need the big, expensive model? Or can a smaller, faster one do the job just as well?

Simple questions go to lightweight models. Complex reasoning stays on the powerful ones. The result: lower costs, faster responses, and a smaller environmental footprint — without changing a single line of your application code.

---

## Architecture

```
Your App
   │
   ▼
┌──────────────────────────────────────┐
│            Frugal AI Router          │
│                                      │
│  ┌──────────────┐  ┌──────────────┐  │
│  │  Request     │  │  Dashboard   │  │
│  │ Middleware   │  │  + Tracing   │  │
│  └──────┬───────┘  └──────────────┘  │
│         │                            │
│   small/large OR exact model         │
│   binary route OR criteria-based     │
└──────────────────┬───────────────────┘
                   │
                   ▼
          Selected target model
   (mapped from small/large or exact)
```

Any request to an LLM is stored in a database using OpenTelemetry standards. The dashboard consumes traces based on the [OTEL GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) and surfaces cost, performance, and routing metadata.

---

## Classifier Middlewares

The router ships with five interchangeable classifiers. Each exposes a `POST /api/v1/classify` endpoint, and the proxy supports both routing styles:

- complexity routing via `{"result":"small"|"large"}`
- exact-model routing via `{"model":"..."}`

| Middleware | How it works | Best for |
|---|---|---|
| 🧮 **Simple** | Heuristic rules (length, keywords) | Zero-dependency baseline |
| 🤖 **ONNX** | ModernBERT model via ONNX Runtime | High-accuracy, no API calls |
| 💬 **LLM** | OpenAI-compatible API call | Flexible, works with any LLM |
| 🔍 **Vector Search** | MongoDB Atlas similarity search | Leveraging historical data |
| 🧠 **SVC** | Arena-Hard criteria (`specificity`, `domain_knowledge`, `complexity`, `problem_solving`, `creativity`, `technical_accuracy`, `real_world`) + weighted escalation + exact model mapping | Lightweight exact-model routing beyond binary small/large |

### API

All classifiers accept the same request shape:

```http
POST /api/v1/classify
Content-Type: application/json

{ "query": "What is 2 + 2?" }
```

Small/large middleware response:

```json
{
  "result": "small",
  "additionalData": { "confidence": 0.97 }
}
```

Exact-model middleware response:

```json
{
  "model": "gpt-5.4-2026-03-05"
}
```

Response values for small/large middleware: `"small"` | `"large"`

Most classifiers also serve a **Swagger UI** at `/` for interactive testing. The SVC middleware is a production-focused Python service with `/health`, `/ready`, and `/api/v1/classify`.

---

## Components

### 🔍 Classifier Middlewares (`/classifier`)

The classifier workspace contains both the shared Bun middleware image and standalone middleware services.

The shared Bun image uses the `MIDDLEWARE` environment variable to select which classifier runs (`simple`, `onnx`, `llm`).

**ONNX Middleware** uses ModernBERT fine-tuned for query complexity classification. Requires model files mounted at `/models`.

**LLM Middleware** uses any OpenAI-compatible API — works with OpenAI, Ollama, LiteLLM, and other providers. Returns a confidence score alongside the classification.

**Vector Search Middleware** is implemented separately in [`classifier/vs-middleware`](classifier/vs-middleware) and uses MongoDB-backed routing.

**SVC Middleware** is implemented in [`classifier/packages/svc-middleware`](classifier/packages/svc-middleware). It is a Python service that predicts the seven Arena-Hard criteria, derives a hardness band (`H1` to `H7`) plus weighted escalation, and returns an exact model identifier to the proxy.

### 📊 Dashboard (`/dashboard`)

Real-time visibility into routing decisions:
- Request classification breakdown (small vs. large)
- Cost and compute savings over time
- Per-middleware performance metrics
- Chat window for interactive testing

### 🔭 Observability

Distributed tracing via **VictoriaTraces** (OpenTelemetry-compatible). Traces are stored and queryable for post-hoc analysis of routing behavior.

---

## Getting Started

### Prerequisites

- [Docker](https://docker.com) + Docker Compose
- [Bun](https://bun.sh) (for local development)

### Run locally

```bash
git clone https://github.com/JonasLiebschner/frugal-code
cd frugal-code

docker compose -f docker-compose.dev.yml up
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:4200 |
| Simple classifier | http://localhost:3000 |
| ONNX classifier | http://localhost:3001 |
| LLM classifier | http://localhost:3002 |
| Vector search classifier | http://localhost:3003 |
| SVC classifier | http://localhost:3004 |

### Configure the LLM middleware

```bash
cp classifier/.env.example classifier/.env
```

```env
# OpenAI
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

# Or Ollama (local)
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.2

# Or LiteLLM proxy
LLM_BASE_URL=http://localhost:4000/v1
LLM_API_KEY=your-key
LLM_MODEL=your-model
```

### ONNX model setup

Place your ModernBERT ONNX model files in `classifier/models/` before starting the `middleware-onnx` service. The directory is volume-mounted into the container.

---

## Deployment

The project ships with a full production setup using **Traefik** as a reverse proxy and **GitHub Actions** for CI/CD.

### Production stack

- **Traefik v3** — TLS termination, routing, Let's Encrypt
- **Docker Compose** — service orchestration
- **GHCR** — Docker image registry
- **GitHub Actions** — build on all branches, push and deploy on `main`

### Routes (production)

| Path | Service |
|---|---|
| `/` | Dashboard frontend |
| `/api/*` | Dashboard backend |
| `/middlewares/simple` | Simple classifier |
| `/middlewares/onnx` | ONNX classifier |
| `/middlewares/llm` | LLM classifier |
| `/middlewares/vs` | Vector search classifier |
| `/middlewares/svc` | SVC exact-model router |
| `/victoria` | VictoriaTraces |

### Required GitHub secrets

```
SSH_HOST, SSH_USER, SSH_PRIVATE_KEY, SSH_PORT, DEPLOY_PATH
MIDDLEWARE_LLM_BASE_URL, MIDDLEWARE_LLM_API_KEY, MIDDLEWARE_LLM_MODEL
MIDDLEWARE_VS_MONGODB_URI, MIDDLEWARE_VS_MONGODB_API_KEY, MIDDLEWARE_VS_MONGODB_DATABASE
```

---

## Local Classifier Development

```bash
cd classifier
bun install

bun run packages/simple-middleware/index.ts   # port 3000
bun run packages/onnx-middleware/index.ts     # port 3001
bun run packages/llm-middleware/index.ts      # port 3002 (requires .env)
```

For the SVC middleware:

```bash
python classifier/packages/svc-middleware/index.py
```

The shared `createClassifyServer` helper handles HTTP routing, OpenAPI spec generation, and Swagger UI. Just implement the `Classifier` interface:

```typescript
import { Classifier, ClassifyResult, QueryComplexity } from "@frugal/shared";

class MyClassifier implements Classifier {
  classify(query: string): ClassifyResult {
    return { result: QueryComplexity.Small };
  }
}
```

---

## Evaluation

The `evaluation_data/` directory contains datasets derived from the [RouterBench](https://arxiv.org/abs/2403.12031) benchmark for evaluating and comparing classifier accuracy across middleware implementations.

**`evaluation_dataset_full.csv`** — All multiple-choice prompts from MMLU, HellaSwag, ARC-Challenge, WinoGrande, and Accounting/Audit benchmarks where at least one model answered correctly.

**`evaluation_dataset_highScattered.csv`** — Top 15 highest-scattering prompts per category (most disagreement across models), useful for testing edge cases.

---

## Project Goals

- Rank different classifier types by accuracy, latency, and resource usage
- Identify optimization parameters for a frugal AI routing strategy
- Design a feedback loop for continuous improvement of routing decisions

> **Assumption:** Cost is used as a proxy for energy consumption.

---

## License

MIT
