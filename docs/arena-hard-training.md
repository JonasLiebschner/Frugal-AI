# Arena-Hard Classifier Plan

## Goal

Train an interpretable escalation layer using the Arena-Hard methodology.

This layer should predict the seven Arena-Hard criteria for a prompt and then derive:

- `hardness_score = number of true criteria`
- `escalation_class in {small_ok, mid_needed, strong_needed}`

This is separate from semantic task-family routing. For now:

- task family stays rule-based
- escalation becomes learned

## Current Source Of Truth

The current benchmark repository is:

- [`lmarena/arena-hard-auto`](https://github.com/lmarena/arena-hard-auto)

This appears to be the newer maintained home for Arena-Hard-Auto.

Important distinction:

- the older `lm-sys/arena-hard` repository was the earlier Arena-Hard benchmark/eval tool
- `lmarena/arena-hard-auto` is the newer repository with:
  - Arena-Hard v2.0 updates
  - newer judges
  - BenchBuilder resources
  - new prompt sets
  - style-control support

So this is not just a random fork. It is effectively the updated current repo under the LM Arena organization.

## Important Constraint

The public Arena-Hard-Auto repository and public dataset clearly provide:

- benchmark prompts
- generated answers
- judgments
- evaluation tooling

But they do not obviously expose a ready-made table of prompt-level binary labels for all seven prompt-selection criteria.

That means for training the 7-criteria predictor we should assume one of two paths:

1. The labels are recoverable from BenchBuilder resources.
2. If not, we create them ourselves by scoring prompts with the same rubric.

## What We Already Found

The public dataset [`lmarena-ai/arena-human-preference-140k`](https://huggingface.co/datasets/lmarena-ai/arena-human-preference-140k/blob/main/README.md)
already exposes:

- `category_tag.criteria_v0.1`
- `is_code`
- `language`
- full conversations
- conversation metadata

That means we already have usable public supervision for the seven criteria.

## Existing LM Arena Models

LM Arena publishes `p2l-*` models such as:

- `lmarena-ai/p2l-135m-grk-01112025`
- `lmarena-ai/p2l-0.5b-grk-01112025`

But those are Prompt-to-Leaderboard models that predict prompt-dependent leaderboard behavior, not direct seven-criteria classifiers.

So they are useful inspiration, but not a direct drop-in replacement for our escalation model.

## Recommended Training Setup

### Outputs

Train a multi-label classifier with seven outputs:

- `specificity`
- `domain_knowledge`
- `complexity`
- `problem_solving`
- `creativity`
- `technical_accuracy`
- `real_world_application`

Then derive:

- `hardness_score = sum(outputs)`
- `small_ok` if score is `0-2`
- `mid_needed` if score is `3-4`
- `strong_needed` if score is `5-7`

For actual routing, also derive:

- `weighted_escalation_score`

using:

`0.10 * specificity + 0.15 * domain_knowledge + 0.25 * complexity + 0.18 * problem_solving + 0.07 * creativity + 0.18 * technical_accuracy + 0.07 * real_world`

and map it to:

- `small_ok` for `< 0.34`
- `mid_needed` for `0.34 - <0.64`
- `strong_needed` for `>= 0.64`

### Why This Is Interpretable

This lets the router explain decisions like:

- "Escalated because the prompt requires domain knowledge, problem solving, and technical accuracy."
- "Stayed on a smaller model because only specificity was triggered."

The split is:

- `hardness_score` for transparent analysis
- `weighted_escalation_score` for actual escalation

## Router Integration

Final runtime shape:

1. Rule-based family router selects:
   - `coding`
   - `reasoning`
   - `structured_extraction`
   - `summarization`
   - `translation`
   - `general_chat`

2. Arena-Hard classifier predicts the seven criteria.

3. Escalation class is derived from the predicted criteria.

4. The model registry picks a model inside the family+tier bucket.

Example:

- family = `coding`
- criteria = `domain_knowledge=1`, `complexity=1`, `problem_solving=1`, `technical_accuracy=1`
- hardness score = `4`
- weighted escalation score = `0.76`
- escalation class = `strong_needed`

The model selector then ranks only the `coding + mid` models.

## Configuration

The rubric and escalation mapping are defined in:

- [`configs/arena_hard_rubric.example.json`](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/configs/arena_hard_rubric.example.json)

## Next Implementation Step

Build a data-prep script that:

1. pulls Arena-Hard-Auto prompts,
2. checks whether BenchBuilder exposes prompt-level criterion labels,
3. if not, produces an annotation-ready table:
   - `prompt_id`
   - `prompt`
   - seven empty criterion columns
   - derived score columns

That dataset becomes the basis for the first escalation classifier.

## Local Scripts

Data prep:

```powershell
python scripts/prepare_arena_hard_training_data.py `
  --out-dir data/arena_hard_training `
  --max-rows 50000
```

Baseline training:

```powershell
python scripts/train_arena_hard_classifier.py `
  --input-csv data/arena_hard_training/arena_hard_training_dedup.csv `
  --out-dir artifacts/arena_hard_classifier
```

Prompt inference:

```powershell
python scripts/predict_arena_hard_criteria.py `
  --prompt "Debug this FastAPI endpoint and explain the root cause before proposing the safest fix."
```
