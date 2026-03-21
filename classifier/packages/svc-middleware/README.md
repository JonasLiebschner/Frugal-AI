# svc-middleware

Python FastAPI middleware that loads the current Arena-Hard SVC classifier and returns an exact `model` for the proxy.

This package is intentionally self-contained so it can be transplanted into the upstream `classifier/packages/` workspace with minimal changes.

Everything needed for routing is bundled inside the package, including the trained classifier artifact.

The production expectation is:

- package-local mapping and registry are shipped with the middleware
- package-local `models/model.joblib` is present by default
- `SVC_MODEL_PATH` can still override the bundled model when needed

## Behavior

- `POST /api/v1/classify`
  - input:
    ```json
    {"query":"Debug this FastAPI endpoint and explain the safest fix."}
    ```
  - output:
    ```json
    {"model":"gpt-5.4-2026-03-05"}
    ```

- `POST /api/v1/classify/debug`
  - returns the chosen model plus the internal criteria / H-band / escalation / candidate scores
  - useful during rollout and debugging

- `GET /health`
- `GET /ready`

## Routing Design

The middleware uses the following routing path:

1. predict the 7 Arena-Hard criteria
2. compute `hardness_score`
3. map `H0` and `H1` to `H1`
4. compute `weighted_escalation_class`
5. choose a candidate model bucket from `(H-band, escalation)`
6. use the full criteria vector as a tie-breaker inside that bucket
7. return only the selected `model`

## Environment

- `PORT`
  - default: `3003`
- `HOST`
  - default: `0.0.0.0`
- `SVC_MAPPING_PATH`
  - path to the routing config JSON
  - default: package-local bundled config
- `SVC_MODEL_PATH`
  - optional classifier artifact override path
  - default: package-local bundled model
- `SVC_ENABLE_DEBUG_ENDPOINTS`
  - default: `true`

## Local Run

```powershell
python -m pip install -r classifier/packages/svc-middleware/requirements.txt

python classifier/packages/svc-middleware/index.py
```

Open:

- `http://localhost:3003/docs`
- `http://localhost:3003/health`

## Docker

Build:

```powershell
docker build -f classifier/packages/svc-middleware/Dockerfile -t svc-middleware ./classifier
```

Run:

```powershell
docker run --rm -p 3003:3003 svc-middleware
```

Optional override:

```powershell
docker run --rm -p 3003:3003 `
  -e SVC_MODEL_PATH=/models/model.joblib `
  -v ${PWD}/some-other-models:/models `
  svc-middleware
```

## Files To Extract Later

Minimum package set for PR to the upstream middleware workspace:

- `classifier/packages/svc-middleware/`

No repo-root config files or repo-root model artifacts are required for runtime anymore.

One integration detail still lives outside the package:

- upstream compose / CI entries need to point at `packages/svc-middleware/Dockerfile` with `./classifier` as build context, matching the existing middleware build pattern
