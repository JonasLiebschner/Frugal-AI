# Frugal-AI

Detailed planning lives in [docs/operational-plan.md](docs/operational-plan.md).

Benchmark pipeline docs live in [docs/benchmark-pipeline.md](docs/benchmark-pipeline.md).

Category-first router logic lives in [docs/router-logic.md](docs/router-logic.md).
Arena-Hard escalation training notes live in [docs/arena-hard-training.md](docs/arena-hard-training.md).

Preview a routing decision with:

```powershell
frugal-bench route-preview `
  --registry configs/router_registry.example.json `
  --prompt "Debug this FastAPI endpoint and return a JSON patch." `
  --requires-json
```
