# Frugal AI Operational Plan

## 1. Purpose

Frugal AI is positioned as a "green model router": an open-source proxy between applications and AI providers that chooses the most resource-appropriate model for each request. The public CloudFest project page defines six hackathon goals:

1. Ship an MVP proxy that can route across multiple providers.
2. Add a task-complexity signal for cheap-vs-capable routing.
3. Make cost and sustainability observable by default.
4. Provide a dashboard that proves savings and explains decisions.
5. Support configurable routing strategies.
6. Create a path toward ecosystem adoption and benchmarking.

This document turns those goals into an operational execution plan for an MVP that can be built, demoed, deployed, and extended.

## 2. Product Thesis

Most teams overpay and over-consume compute because they send all prompts to a small number of premium models. Frugal AI should reduce waste by making model selection a policy decision instead of a hard-coded default.

The MVP succeeds if it can:

- accept OpenAI-compatible chat requests through one endpoint,
- choose between at least 3 models across at least 2 providers,
- explain why it chose that model,
- estimate cost and environmental impact for every request,
- let an operator switch routing policy without code changes,
- show measurable savings on a dashboard and in a demo dataset.

## 3. MVP Scope

### In scope

- HTTP proxy service with an OpenAI-compatible API surface for chat completions.
- Provider adapters for 2 providers minimum, 3 if time allows.
- Routing engine with configurable policies:
  - `cost_first`
  - `green_first`
  - `quality_first`
  - `balanced`
- Lightweight request analyzer that estimates task complexity before dispatch.
- Request logging with:
  - prompt metadata,
  - chosen provider/model,
  - fallback chain,
  - latency,
  - token counts,
  - estimated cost,
  - estimated energy/CO2 proxy values.
- Simple dashboard for routing decisions, totals, trends, and per-policy comparison.
- Admin configuration for providers, models, budgets, and policy weights.
- Evaluation harness with a curated benchmark set that demonstrates routing behavior.
- Dockerized local deployment.

### Explicitly out of scope for MVP

- Fine-tuned ML classifier.
- Guaranteed "true" carbon measurements at the hardware level.
- Full multi-tenant billing system.
- Enterprise auth/SSO.
- Browser extension or public leaderboard.
- Deep framework- or platform-specific integrations beyond a minimal reference integration.

## 4. Users and Jobs To Be Done

### Primary users

- Application developers integrating LLM features into products.
- Platform teams centralizing model access, policy, and governance.
- Product and engineering teams optimizing AI cost, latency, and sustainability.
- Organizations that need auditable model-routing decisions and usage reporting.

### Core jobs

- "Give me one API endpoint instead of hard-coding vendor/model choices."
- "Keep latency and quality acceptable while reducing cost."
- "Show me evidence that routing decisions saved money and emissions."
- "Let me change policy centrally without changing my app."

## 5. Success Metrics

### Demo success

- One sample application can swap its base URL to Frugal AI and work unchanged.
- The router visibly chooses different models for different prompt types.
- The dashboard shows savings versus an "always use premium model" baseline.

### MVP acceptance metrics

- At least 95% of benchmark requests complete successfully through the proxy.
- At least 20-40% modeled cost reduction on the benchmark set versus premium-only routing.
- At least 25% of requests are routed away from the top-tier model with acceptable output quality.
- Routing decision explanation is stored for 100% of completed requests.
- Basic dashboard loads under 2 seconds for the last 1,000 requests.

### Operational metrics

- P95 end-to-end proxy overhead under 250 ms excluding provider latency.
- Error rate under 2% on healthy providers.
- No secrets leaked to logs.
- Provider outages trigger fallback rather than total request failure where possible.

## 6. Reference Architecture

### Core services

1. API Gateway / Router Service
   - Receives application requests.
   - Normalizes payloads.
   - Authenticates caller.
   - Invokes request analyzer and policy engine.
   - Calls provider adapter.
   - Emits logs and metrics.

2. Request Analyzer
   - Extracts structured features from the request.
   - Estimates complexity, risk, expected context size, and latency sensitivity.
   - Produces a routing hint rather than a hard decision.

3. Policy Engine
   - Scores eligible models using weights for cost, energy, quality, latency, and availability.
   - Applies guardrails such as max budget, max latency, or provider allowlist.
   - Produces primary and fallback model candidates.

4. Provider Adapter Layer
   - Standardizes request and response handling across providers.
   - Tracks capability flags per model:
     - streaming,
     - tool calling,
     - context length,
     - structured output,
     - multimodality.

5. Telemetry + Impact Estimator
   - Stores request facts, token usage, routing reasons, latency, and errors.
   - Computes estimated cost and sustainability proxies.

6. Dashboard / Admin UI
   - Displays usage, savings, routing traces, and policy configuration.

### Data stores

- PostgreSQL for transactional records and configuration.
- Redis optional for caching model metadata and recent routing decisions.
- Object storage optional later for benchmark artifacts and exports.

### Deployment topology

- One Docker Compose setup for local/demo:
  - `api`
  - `worker` if background aggregation is needed
  - `postgres`
  - `redis` optional
  - `web`
- One cloud deployment path for production-like operation:
  - containerized API behind HTTPS,
  - managed Postgres,
  - secrets manager,
  - observability backend.

## 7. Suggested Tech Stack

### Backend

- Python with FastAPI.
- `httpx` for provider integrations.
- Pydantic models for schema validation.
- SQLAlchemy + Alembic for persistence.
- Celery/RQ optional only if async aggregation becomes necessary.

### Frontend

- React + Vite.
- Charting with Recharts or Apache ECharts.
- Minimal admin forms, routing trace tables, and aggregate metric cards.

### Infra

- Docker and Docker Compose.
- GitHub Actions for CI.
- OpenTelemetry for traces/metrics if time allows.

This stack is pragmatic for a hackathon: fast to build, easy to demo, and extensible if the project continues.

## 8. Recommended Repository Layout

```text
frugal-ai/
  apps/
    api/
    web/
  packages/
    core/
    provider-openai/
    provider-anthropic/
    provider-openrouter/   # optional stretch
    evals/
    shared-types/
  infra/
    docker/
    compose/
  docs/
    operational-plan.md
    architecture.md
    api-spec.md
    demo-script.md
  data/
    benchmarks/
    seed/
```

If the team prefers one-language simplicity, the monorepo can stay Python-first with a separate frontend app.

## 9. Functional Design

### 9.1 API surface

Use an OpenAI-compatible path first because it lowers integration effort:

- `POST /v1/chat/completions`
- `GET /v1/models`
- `GET /health`
- `GET /metrics`
- `GET /api/requests`
- `GET /api/requests/{id}`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/trends`
- `GET /api/policies`
- `PUT /api/policies/{name}`

### 9.2 Request flow

1. Client sends a chat completion request to Frugal AI.
2. Router validates payload and identifies requested capabilities.
3. Analyzer extracts features:
   - prompt length,
   - system prompt presence,
   - tool/function usage,
   - structured output requirement,
   - keywords indicating reasoning, coding, summarization, classification, translation, etc.
4. Policy engine filters out incompatible models.
5. Remaining models are scored.
6. Best model is chosen; fallback candidates are stored.
7. Provider adapter executes request.
8. Usage, latency, cost, and impact estimates are persisted.
9. Response returns to caller with optional routing metadata headers.

### 9.3 Routing policy formula

Each candidate model gets a composite score:

`score = w_cost * cost_score + w_green * energy_score + w_quality * quality_score + w_latency * latency_score + w_reliability * reliability_score`

Then apply hard constraints:

- required capability support,
- max cost per request,
- max latency tier,
- policy allow/deny list,
- user override if enabled.

### 9.4 Request analyzer heuristic v1

Avoid overcomplication early. A heuristic classifier is enough for MVP.

Signals:

- low complexity:
  - short prompt,
  - summarization,
  - extraction,
  - classification,
  - rewriting,
  - translation,
  - FAQ/chatbot response.
- medium complexity:
  - longer context,
  - moderate synthesis,
  - templated drafting,
  - constrained coding help.
- high complexity:
  - multi-step reasoning,
  - extensive code generation,
  - agent/tool orchestration,
  - large context,
  - ambiguous research tasks.

Output shape:

```json
{
  "task_type": "summarization",
  "complexity": "low",
  "needs_tools": false,
  "needs_json": false,
  "latency_sensitivity": "medium",
  "confidence": 0.81
}
```

### 9.5 Model registry

Maintain a registry table or config file with:

- provider,
- model id,
- pricing,
- context window,
- modality flags,
- estimated relative quality score,
- estimated energy score,
- estimated reliability score,
- status (`active`, `degraded`, `disabled`).

This registry is the heart of routing and should be editable without redeploying code.

## 10. Sustainability Methodology

The public project page calls for visibility into energy savings and carbon impact, but an MVP should be explicit that values are estimated proxies.

### MVP estimation approach

Compute:

- estimated input tokens,
- estimated output tokens,
- model-specific cost,
- model-specific relative energy intensity score,
- region-level carbon intensity assumption if available,
- "baseline premium model" counterfactual.

Store both:

- actual route estimate,
- baseline estimate if the request had gone to the default premium model.

Derived metrics:

- estimated cost saved,
- estimated energy saved,
- estimated CO2e avoided,
- percentage reduction versus baseline.

### Guardrails

- Label all sustainability numbers as estimates.
- Version the estimation formula.
- Store source assumptions with each result so future methodology updates remain auditable.

## 11. Data Model

### Core tables

- `api_keys`
- `providers`
- `models`
- `routing_policies`
- `policy_versions`
- `requests`
- `request_messages`
- `routing_decisions`
- `request_usage`
- `impact_estimates`
- `benchmark_runs`
- `benchmark_results`
- `system_events`

### Important request fields

- request id
- tenant/environment
- timestamp
- task type
- complexity class
- chosen provider/model
- rejected candidates and reason
- fallback used
- latency
- prompt tokens
- completion tokens
- cost estimate
- energy estimate
- carbon estimate
- baseline cost/carbon
- response status

## 12. Security and Compliance

### MVP baseline

- Encrypt secrets at rest via environment or secrets manager.
- Never store raw provider keys in client-visible contexts.
- Redact or hash sensitive prompt fields in logs when full retention is unnecessary.
- Support prompt logging toggle.
- Add simple per-key rate limits.
- Add auth for dashboard/admin APIs.

### Later hardening

- Tenant isolation.
- Audit logs for config changes.
- Data retention controls.
- Regional deployment controls.

## 13. Reliability Plan

### Fallback behavior

- If analyzer fails, route using a safe default policy.
- If top-ranked provider errors, attempt fallback candidates that satisfy required capabilities.
- If telemetry persistence fails, do not block the end-user response unless strict audit mode is enabled.

### Operational protections

- Provider timeout budget.
- Circuit breaker per provider/model.
- Health status override in model registry.
- Retry policy only for safe failure modes.

## 14. Observability Plan

### Logs

- request received
- policy evaluated
- model selected
- provider call started/completed
- fallback triggered
- request completed/failed

### Metrics

- requests per minute
- success/error rate
- average tokens/request
- cost by provider/model/policy
- baseline vs actual savings
- estimated CO2e avoided
- latency percentiles
- fallback rate

### Traces

- API ingress
- analyzer
- policy engine
- provider call
- persistence

## 15. Dashboard Plan

### MVP screens

1. Overview
   - total requests
   - cost saved
   - estimated CO2e avoided
   - policy mix
   - success rate

2. Routing Trace Explorer
   - request list
   - request detail
   - selected model
   - rejected models and reasons
   - fallback path

3. Model Registry
   - active models
   - pricing
   - energy score
   - quality score
   - status

4. Policy Config
   - weight sliders or form fields
   - per-policy preview against sample prompts

5. Benchmark Results
   - compare "always premium" vs "Frugal AI"
   - compare policies

## 16. Benchmarking and Evaluation

### Why this matters

The product claim is not just "we route requests." It is "we route them more efficiently without unacceptable quality loss." That needs evidence.

### Benchmark dataset categories

- summarization
- classification
- extraction
- translation
- FAQ/short chat
- content drafting
- code generation
- reasoning-heavy prompts

### Evaluation outputs

- route chosen by each policy
- cost estimate
- energy/carbon estimate
- latency
- pass/fail or rubric quality score
- disagreement cases for human review

### MVP evaluation strategy

- Use a curated dataset of 50-100 prompts.
- Establish a premium-model baseline.
- Human-review a subset for quality acceptability.
- Publish summary charts for demo credibility.

## 17. Ecosystem Adoption

Keep the first integration minimal and broadly reusable:

- one sample client integration or SDK wrapper,
- one guide showing how to point an existing AI feature at Frugal AI,
- one end-to-end example:
  - user action in an application,
  - request enters Frugal AI,
  - router selects model,
  - dashboard records savings.

This is enough to demonstrate cross-platform relevance without derailing the MVP.

## 18. Delivery Plan

### Phase 0: Alignment and setup

Duration: 0.5-1 day

Deliverables:

- architecture decision record,
- stack decision,
- repo structure,
- issue backlog,
- owners per workstream,
- demo success definition.

### Phase 1: Core routing skeleton

Duration: 1-2 days

Deliverables:

- FastAPI app,
- health endpoint,
- OpenAI-compatible chat endpoint,
- provider abstraction,
- one mock adapter,
- request persistence schema,
- Docker Compose bootstrapping.

Exit criteria:

- local request can enter proxy and return a mocked routed response,
- telemetry row is stored.

### Phase 2: Provider integrations

Duration: 1-2 days

Deliverables:

- provider adapter A,
- provider adapter B,
- optional provider adapter C,
- unified response normalization,
- model registry seed data.

Exit criteria:

- same client payload works against at least two real providers.

### Phase 3: Analyzer and policy engine

Duration: 1-2 days

Deliverables:

- heuristic analyzer,
- policy scoring engine,
- route explanation payload,
- fallback chain support.

Exit criteria:

- distinct prompt types route to different models for explainable reasons.

### Phase 4: Telemetry, cost, and sustainability estimates

Duration: 1 day

Deliverables:

- usage logging,
- baseline comparison logic,
- cost estimator,
- energy/CO2 proxy estimator,
- summary API endpoints.

Exit criteria:

- every completed request has a cost/impact record.

### Phase 5: Dashboard

Duration: 1-2 days

Deliverables:

- overview page,
- routing trace table,
- benchmark comparison chart,
- policy configuration UI.

Exit criteria:

- non-technical reviewer can understand the value in under 2 minutes.

### Phase 6: Benchmarking + demo hardening

Duration: 1 day

Deliverables:

- benchmark dataset,
- sample results,
- scripted demo flow,
- deployment checklist,
- README and architecture docs.

Exit criteria:

- team can run the demo reliably end-to-end in one command path.

## 19. Workstreams and Ownership

### Workstream A: Backend routing

Own:

- API service
- provider adapters
- analyzer
- policy engine
- fallback logic

### Workstream B: Data + telemetry

Own:

- schema design
- cost estimator
- sustainability estimator
- benchmark storage
- summary APIs

### Workstream C: Frontend

Own:

- dashboard
- admin config
- request explorer
- benchmark visualizations

### Workstream D: Platform / DevOps

Own:

- Docker
- environment config
- deployment path
- CI
- secrets handling

### Workstream E: Research / methodology / docs

Own:

- benchmark prompt set
- quality rubric
- sustainability assumptions
- demo narrative
- public-facing docs and pitch

## 20. Day-By-Day Hackathon Plan

### Day 1

- lock scope,
- assign owners,
- create skeleton services,
- define model registry schema,
- get one request flowing through the proxy.

### Day 2

- integrate 2 providers,
- persist requests and usage,
- implement heuristic analyzer,
- implement first scoring policy.

### Day 3

- add dashboard,
- baseline comparison math,
- benchmark harness,
- policy switching and route explanations.

### Day 4

- tighten UX,
- improve fallback handling,
- validate benchmark outputs,
- record demo data,
- rehearse pitch.

## 21. Backlog Prioritization

### P0: Must have

- proxy endpoint
- 2 providers
- model registry
- heuristic analyzer
- routing policies
- telemetry persistence
- cost/impact estimation
- basic dashboard
- Dockerized local run

### P1: Should have

- fallback chains
- benchmark runner
- policy editor
- reference client integration example
- exportable reports

### P2: Nice to have

- additional providers
- browser extension concept
- public leaderboard
- advanced ML classifier
- tenant quotas and billing

## 22. Key Risks and Mitigations

### Risk: routing looks arbitrary

Mitigation:

- store route explanations,
- keep policy formula simple and inspectable,
- surface rejected candidates and why.

### Risk: sustainability claims feel hand-wavy

Mitigation:

- clearly label estimates,
- version the methodology,
- compare against an explicit baseline rather than claiming exact hardware truth.

### Risk: too much time spent on provider edge cases

Mitigation:

- standardize on a narrow OpenAI-compatible subset first,
- defer advanced capabilities unless required.

### Risk: dashboard looks good but value is unproven

Mitigation:

- build benchmark evidence early,
- collect before/after charts using fixed prompt sets.

### Risk: demo fails due to provider instability

Mitigation:

- support mock/demo mode,
- cache representative runs,
- include fallback providers,
- seed dashboard with stable demo data.

## 23. Definition of Done for MVP

The MVP is done when:

- a sample app can send a request to Frugal AI through one endpoint,
- Frugal AI chooses among multiple models based on a visible policy,
- every request records cost and sustainability estimates,
- a dashboard shows savings and explains routing decisions,
- the team can run a live or semi-live demo reliably,
- setup instructions allow another developer to reproduce the stack locally.

## 24. Recommended Immediate Next Steps

1. Approve the MVP scope exactly as defined above, especially what is out of scope.
2. Choose the backend-first stack: FastAPI + Postgres + React + Docker.
3. Create the monorepo structure and bootstrap the API and web apps.
4. Implement the OpenAI-compatible proxy contract before any UI work.
5. Seed a small model registry for 3-5 candidate models.
6. Build the heuristic analyzer and scoring engine in their simplest inspectable form.
7. Add telemetry and baseline-comparison math immediately after the first real routed request.
8. Build only the dashboard views needed to make the value obvious.
9. Assemble a curated benchmark set before polishing.
10. Script the demo and rehearse it against both live and mock providers.

## 25. Sources

- CloudFest project brief: https://hackathon.cloudfest.com/project/frugal-ai/
