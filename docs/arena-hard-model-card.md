# Arena-Hard Escalation Model Card

## 1. Overview

This document describes the first trained escalation model used in Frugal AI.

The model predicts the seven Arena-Hard-style prompt criteria from prompt text and then derives:

- an interpretable `hardness_score`
- a routing-oriented `weighted_escalation_score`
- an escalation class:
  - `small_ok`
  - `mid_needed`
  - `strong_needed`

This model is not a semantic task-family classifier. It is the learned escalation layer that sits alongside a separate task-family router.

## 2. Intended Role In The Router

The intended runtime design is:

1. A rule-based or future learned family router picks:
   - `coding`
   - `reasoning`
   - `structured_extraction`
   - `summarization`
   - `translation`
   - `general_chat`

2. This Arena-Hard model predicts the seven prompt criteria.

3. The predicted criteria are used to compute:
   - `hardness_score`
   - `weighted_escalation_score`
   - `weighted_escalation_class`

4. The router selects the model tier inside the chosen family:
   - `small`
   - `mid`
   - `strong`

So this model answers:

- "How hard is this prompt?"
- "Does this prompt need escalation?"

It does not answer:

- "What task family is this?"
- "Which exact model should I use?"

## 3. Source Data

### 3.1 Upstream dataset

Training data was prepared from:

- `lmarena-ai/arena-human-preference-140k`

This public LM Arena dataset contains prompt-level metadata including:

- `category_tag.criteria_v0.1`
- `is_code`
- `language`
- conversation structure and token metadata
- pairwise model preference outcomes

The original human preference `winner` field was preserved for analysis, but it was not used as the training target for this model.

### 3.2 What was used as ground truth

The training labels came from the seven boolean values in:

- `category_tag.criteria_v0.1`

The exact labels used were:

- `specificity`
- `domain_knowledge`
- `complexity`
- `problem_solving`
- `creativity`
- `technical_accuracy`
- `real_world`

These seven labels are the direct supervision targets for the classifier.

### 3.3 Data selection

For the first baseline:

- only English rows were used
- code prompts were excluded
- prompts were deduplicated by prompt hash before training

Selection settings:

- language: `en`
- include code prompts: `false`
- requested max rows: `50,000`

Observed extraction result:

- raw extracted rows: `46,809`
- deduplicated prompt rows: `38,321`
- average duplicate count before dedupe: `1.2215`

The prep metadata is stored at:

- [arena_hard_training_metadata.json](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/data/arena_hard_training/arena_hard_training_metadata.json)

### 3.4 Local training tables

Raw extracted table:

- [arena_hard_training_raw.csv](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/data/arena_hard_training/arena_hard_training_raw.csv)

Deduplicated prompt-level table:

- [arena_hard_training_dedup.csv](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/data/arena_hard_training/arena_hard_training_dedup.csv)

## 4. Training Data Schema

### 4.1 Raw table columns

The raw table contains:

- `id`
  Original LM Arena row id.

- `evaluation_session_id`
  Original session id.

- `prompt_hash`
  SHA-256 hash of normalized prompt text.

- `prompt`
  Prompt extracted from the first user turn.

- `language`
  Language label from the upstream dataset.

- `is_code`
  Whether the upstream dataset marked the prompt as code-related.

- `turns`
  Number of conversation turns.

- `sum_user_tokens`
  Aggregate user-side token count from the conversation metadata.

- `model_a`
  First model in the pairwise comparison.

- `model_b`
  Second model in the pairwise comparison.

- `winner`
  Human preference winner for the model comparison.

- `specificity`
- `domain_knowledge`
- `complexity`
- `problem_solving`
- `creativity`
- `technical_accuracy`
- `real_world`
  The seven binary criterion labels used as training truth.

- `hardness_score`
  Simple sum of the seven criteria.

- `escalation_class`
  Unweighted escalation class derived from `hardness_score`:
  - `small_ok` for `0-2`
  - `mid_needed` for `3-4`
  - `strong_needed` for `5-7`

- `weighted_escalation_score`
  Weighted score used for routing-oriented escalation.

- `weighted_escalation_class`
  Escalation class derived from `weighted_escalation_score`.

### 4.2 Deduplicated table columns

The deduplicated table contains:

- `prompt_hash`
- `prompt`
- `language`
- `is_code`
- `turns`
- `sum_user_tokens`
- `sample_count`
  Number of original rows grouped into the same prompt.

- the same seven criterion columns
  aggregated by majority vote across duplicate prompt rows

- `hardness_score`
- `escalation_class`
- `weighted_escalation_score`
- `weighted_escalation_class`

## 5. Label Construction

### 5.1 Seven-criteria prediction target

The model is trained as a multi-label classifier.

For each prompt it predicts:

- `specificity`
- `domain_knowledge`
- `complexity`
- `problem_solving`
- `creativity`
- `technical_accuracy`
- `real_world`

Each label is binary.

### 5.2 Hardness score

The diagnostic hardness score is:

`hardness_score = sum(all 7 binary criteria)`

This produces a score in `[0, 7]`.

This score is kept for interpretability and reporting.

### 5.3 Weighted escalation score

The routing-oriented escalation score is:

```text
0.10 * specificity
+ 0.15 * domain_knowledge
+ 0.25 * complexity
+ 0.18 * problem_solving
+ 0.07 * creativity
+ 0.18 * technical_accuracy
+ 0.07 * real_world
```

The weights are defined in:

- [arena_hard_rubric.example.json](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/configs/arena_hard_rubric.example.json)

### 5.4 Escalation bucket mapping

Weighted escalation class is currently mapped as:

- `small_ok` for score `< 0.34`
- `mid_needed` for score `0.34` to `< 0.64`
- `strong_needed` for score `>= 0.64`

The unweighted hardness-based escalation class is still stored for analysis, but the intended router should prefer the weighted version.

## 6. Dataset Statistics

Based on the deduplicated training table:

- total rows: `38,321`
- language distribution:
  - `en`: `38,321`
- code prompt distribution:
  - `False`: `38,321`
- average turns: `1.2216`
- average user tokens: `73.7188`

### 6.1 Hardness distribution

- `0`: `3,604`
- `1`: `2,371`
- `2`: `4,830`
- `3`: `6,538`
- `4`: `5,541`
- `5`: `5,883`
- `6`: `4,320`
- `7`: `5,234`

### 6.2 Weighted escalation distribution

- `small_ok`: `11,167`
- `mid_needed`: `12,050`
- `strong_needed`: `15,104`

### 6.3 Positive rate by criterion

- `specificity`: `0.4896`
- `domain_knowledge`: `0.7669`
- `complexity`: `0.4297`
- `problem_solving`: `0.6189`
- `creativity`: `0.5039`
- `technical_accuracy`: `0.5130`
- `real_world`: `0.4822`

## 7. Model Architecture

### 7.1 Modeling choice

The first baseline is a sparse linear text classifier:

- featureizer: `TfidfVectorizer`
- classifier: `OneVsRestClassifier(LogisticRegression)`

This was chosen because it is:

- fast to train
- easy to reproduce
- easy to inspect
- strong enough for a first production-adjacent baseline

### 7.2 Exact training setup

The training script is:

- [train_arena_hard_classifier.py](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/scripts/train_arena_hard_classifier.py)

Feature pipeline:

- input field: `prompt`
- TF-IDF ngrams: `(1, 2)`
- `min_df = 3`
- `max_features = 50,000`

Classifier:

- `OneVsRestClassifier(LogisticRegression(...))`
- `class_weight = "balanced"`
- `max_iter = 600`

Train/test split:

- train size: `30,656`
- test size: `7,665`
- test fraction: `0.2`
- seed: `42`

### 7.3 Model artifact

Saved artifact:

- [arena_hard_criteria_classifier.joblib](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/artifacts/arena_hard_classifier/arena_hard_criteria_classifier.joblib)

## 8. Evaluation

Metrics are stored in:

- [metrics.json](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/artifacts/arena_hard_classifier/metrics.json)

### 8.1 Overall metrics

- criteria micro-F1: `0.7718`
- criteria macro-F1: `0.7640`
- exact 7-label match accuracy: `0.2290`
- hardness MAE: `1.3281`
- hardness-based escalation accuracy: `0.6059`
- weighted escalation MAE: `0.2013`
- weighted escalation accuracy: `0.5958`

### 8.2 Per-label performance

- `specificity`
  - precision: `0.7364`
  - recall: `0.7455`
  - F1: `0.7409`

- `domain_knowledge`
  - precision: `0.8933`
  - recall: `0.8178`
  - F1: `0.8539`

- `complexity`
  - precision: `0.6604`
  - recall: `0.7003`
  - F1: `0.6798`

- `problem_solving`
  - precision: `0.8312`
  - recall: `0.7860`
  - F1: `0.8080`

- `creativity`
  - precision: `0.7820`
  - recall: `0.7621`
  - F1: `0.7719`

- `technical_accuracy`
  - precision: `0.7203`
  - recall: `0.7153`
  - F1: `0.7178`

- `real_world`
  - precision: `0.7707`
  - recall: `0.7808`
  - F1: `0.7757`

## 9. Inference Behavior

Prompt-level inference is available through:

- [predict_arena_hard_criteria.py](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/scripts/predict_arena_hard_criteria.py)

It returns:

- predicted seven criteria
- `hardness_score`
- `hardness_escalation_class`
- `weighted_escalation_score`
- `weighted_escalation_class`

Example usage:

```powershell
python scripts/predict_arena_hard_criteria.py `
  --prompt "Debug this FastAPI endpoint and explain the root cause before proposing the safest fix."
```

Preview outputs:

- [prediction_preview.csv](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/artifacts/arena_hard_classifier/prediction_preview.csv)
- [prediction_preview_readable.csv](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/artifacts/arena_hard_classifier/prediction_preview_readable.csv)

## 10. Strengths

- Uses real public LM Arena prompt annotations rather than synthetic labels.
- Produces interpretable multi-label outputs, not just a single escalation class.
- Keeps both descriptive hardness and routing-oriented escalation.
- Fast enough to train and retrain locally.
- Easy to audit and compare across rubric changes.

## 11. Limitations

- English-only in this version.
- Code prompts were excluded from the first baseline.
- No semantic task-family prediction yet.
- Uses only prompt text and not richer metadata at inference time.
- Exact 7-label match is still relatively low, which is expected in multi-label prompt tagging.
- Weighted escalation thresholds are heuristic and should later be calibrated against measured routing outcomes.

## 12. Recommended Next Steps

1. Train a second version including code prompts.
2. Compare text-only features versus text plus lightweight numeric metadata.
3. Calibrate weighted escalation thresholds against benchmark performance of small/mid/strong model tiers.
4. Add family-aware routing integration:
   - family router first
   - Arena-Hard criteria model second
   - tier selection from weighted escalation class
   - final model ranking inside the chosen family+tier bucket
5. Evaluate whether a stronger encoder model improves weighted escalation accuracy meaningfully over the sparse linear baseline.

## 13. Reproducibility

Data preparation:

```powershell
python scripts/prepare_arena_hard_training_data.py `
  --out-dir data/arena_hard_training `
  --max-rows 50000
```

Training:

```powershell
python scripts/train_arena_hard_classifier.py `
  --input-csv data/arena_hard_training/arena_hard_training_dedup.csv `
  --out-dir artifacts/arena_hard_classifier
```

Inference:

```powershell
python scripts/predict_arena_hard_criteria.py `
  --prompt "Debug this FastAPI endpoint and explain the root cause before proposing the safest fix."
```

## 14. References

- [LM Arena Human Preference 140k Dataset](https://huggingface.co/datasets/lmarena-ai/arena-human-preference-140k)
- [Arena-Hard Auto Repository](https://github.com/lmarena/arena-hard-auto)
- [Arena-Hard Classifier Notes](/c:/Users/ckda5/OneDrive/CF_Hack/Frugal-AI/docs/arena-hard-training.md)
