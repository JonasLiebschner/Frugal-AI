# SVC Middleware Integration Plan

## Goal

Ship a first middleware that uses the current Arena-Hard SVC classifier and returns an exact `model` to the proxy, rather than returning only `small` or `large`.

This keeps the middleware compatible with the newly observed proxy behavior:

- old contract still works with `{"result":"small"}`
- additive contract can now return `{"model":"xyz"}`

## Current State

The current best lightweight classifier lives at:

- [`artifacts/arena_hard_classifier_best_linear_svc/model.joblib`](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/artifacts/arena_hard_classifier_best_linear_svc/model.joblib)

It is a Python / scikit-learn artifact containing:

- `word_vectorizer`
- `char_vectorizer`
- `estimator`
- `criteria_columns`

It is not ONNX and not directly Bun-runnable.

## Recommendation for V1

Use a Python middleware service for the SVC path.

Why:

- the model artifact is already Python-native
- no need to reimplement sklearn inference in TypeScript
- faster path to a working middleware
- easier to debug during first proxy integration

## What ONNX Would Mean Later

ONNX is a portable inference format. It is useful when we want:

- a learned model
- no Python dependency in production
- Bun / Node inference through `onnxruntime-node`

That is a good fit for the Roberta/transformer path later, but it is not the best first step for the current SVC.

## Current Model Outputs

The current SVC logic predicts the 7 Arena-Hard criteria:

- `specificity`
- `domain_knowledge`
- `complexity`
- `problem_solving`
- `creativity`
- `technical_accuracy`
- `real_world`

From those we derive:

- `hardness_score`
- `hardness_band` where `H0` and `H1` are both routed as `H1`
- `weighted_escalation_score`
- `weighted_escalation_class`

The current helper module is:

- [`src/frugal_bench/svc_router.py`](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/src/frugal_bench/svc_router.py)

## Routing Design

For this middleware track, semantic task families are intentionally not used in V1.

The chosen design is:

- prompt -> 7 criteria
- 7 criteria -> hardness sum
- hardness sum -> `H1..H7` where `H0` is clamped to `H1`
- 7 criteria -> weighted escalation
- `H-band + escalation` -> candidate model bucket
- full criteria vector -> tie-break score across the candidate models
- selected candidate -> exact `model`

This means the middleware is intentionally built around hardness-oriented routing, not semantic task-family routing.

## V1 Mapping

The example model-only mapping lives at:

- [`configs/svc_middleware_mapping.website_connections.example.json`](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/configs/svc_middleware_mapping.website_connections.example.json)

Current example mapping is a bucket table:

- `H1..H7`
- each band has:
  - `small_ok`
  - `mid_needed`
  - `strong_needed`
- each bucket contains 1..N candidate models

Then the criteria vector is used to pick the best candidate inside that bucket.

This is intentionally hardness-first and does not rely on task-family routing.

## Middleware Response Shape

Preferred V1 response:

```json
{
  "model": "qwen3.5-35b-a3b"
}
```

Recommended debug response during rollout:

```json
{
  "model": "qwen3.5-35b-a3b",
  "additionalData": {
    "classification": {
      "criteria": {
        "specificity": 1,
        "domain_knowledge": 0,
        "complexity": 1,
        "problem_solving": 1,
        "creativity": 0,
        "technical_accuracy": 1,
        "real_world": 0
      },
      "hardness_score": 4,
      "hardness_band": "H4",
      "weighted_escalation_score": 0.71,
      "weighted_escalation_class": "strong_needed",
      "classifier_type": "arena_hard_svc"
    }
  }
}
```

## Reusable Core Added in This Branch

To reduce integration risk, the reusable routing core is now already implemented:

- [`src/frugal_bench/svc_router.py`](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/src/frugal_bench/svc_router.py)

This module:

- loads the current joblib artifact
- predicts the 7 criteria
- computes hardness band and weighted escalation
- resolves a candidate bucket from `H-band + escalation`
- uses the full criteria vector as a tie-breaker across those candidates
- maps the winning candidate to an exact model id
- builds a middleware-style response

Preview script:

- [`scripts/preview_svc_model_route.py`](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/scripts/preview_svc_model_route.py)

Example usage:

```powershell
python scripts/preview_svc_model_route.py `
  --prompt "Debug this FastAPI endpoint and explain the safest fix."
```

## Integration Steps

1. Bring the upstream `classifier/` middleware workspace from `origin/main` / `origin/feat/classifier-middlewares` into this branch.
2. Add a new `svc-middleware` service beside the existing middleware packages.
3. Implement the HTTP layer in Python (FastAPI recommended).
4. Wrap the shared routing core from `svc_router.py`.
5. Add Dockerfile and compose entries.
6. Add middleware-specific endpoints and behaviors:
   - `POST /api/v1/classify`
   - `GET /health`
   - optional readiness endpoint
   - optional config/model load diagnostics in debug mode
7. Register the middleware in the proxy config so it appears in the UI selector.
8. Smoke test:
   - `POST /api/v1/classify`
   - proxy selects middleware
   - middleware returns exact `model`
   - proxy routes to that exact model successfully

## Do We Need to Update the Model?

Not for this H-band implementation.

The current SVC already predicts the 7 criteria, which is enough for:

- hardness sum
- H-band
- weighted escalation
- criteria-vector tie-break routing

We only need a new model if we later decide that:

- the 7 criteria are not accurate enough, or
- we want a different output head entirely.
