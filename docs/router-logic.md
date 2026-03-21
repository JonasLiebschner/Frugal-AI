# Category-First Router Logic

## Purpose

The router should not jump directly from "prompt" to "model." It should first answer:

1. What kind of task is this?
2. How complex or risky is it?
3. What capabilities are required?
4. Which model category is safest?
5. Which specific model inside that category is the best fit right now?

That gives us a safer and more extensible routing path than a simple strong-vs-weak split.

## Decision Flow

1. Analyze the prompt into structured signals:
   - `code_signal`
   - `reasoning_signal`
   - `translation_signal`
   - `summarization_signal`
   - `extraction_signal`
   - `classification_signal`
   - `structured_output_signal`
   - `tool_signal`
   - `latency_signal`
   - `safety_signal`
   - `long_context_signal`
   - `complexity_score`
   - `complexity_label`

2. Score categories from those signals.

3. Pick the top category plus 1-2 fallback categories.

4. Inside the chosen category, score models using:
   - category membership
   - required capabilities
   - context fit
   - provider allow/deny rules
   - trait weights such as `quality`, `reasoning`, `coding`, `speed`, `cost`, `reliability`

5. Return:
   - chosen category
   - chosen model
   - fallback categories
   - fallback models
   - feature breakdown
   - score explanations

## Why This Is Better

- Category selection is more stable than exact model selection.
- Adding a new model is mostly config work:
  - add the model profile,
  - tag it with categories,
  - set its capabilities and trait scores.
- If one model gets worse or disappears, category selection still holds and the router stays sane.
- The system is explainable enough for dashboards and audit traces.

## Config Structure

The registry file at [`configs/router_registry.example.json`](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/configs/router_registry.example.json) contains:

- `defaults`
- `categories`
- `models`

Each category defines:

- prompt feature weights
- preferred/required capabilities
- complexity bias
- positive and negative keywords
- model trait weights

Each model defines:

- provider
- category membership
- capabilities
- max context
- trait scores

## CLI Preview

Use:

```powershell
frugal-bench route-preview `
  --registry configs/router_registry.example.json `
  --prompt "Debug this FastAPI endpoint and return a JSON patch." `
  --requires-json
```

That prints the full decision object as JSON so we can inspect why the router chose a category and model.

## Good Next Step

Wire this logic into the eventual proxy service as:

- request analyzer
- category selector
- model selector
- route explanation payload

Then log every decision for later calibration and learning.
