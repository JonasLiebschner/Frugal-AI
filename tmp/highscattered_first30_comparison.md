# Baseline vs Middleware Comparison

- Generated at: `2026-03-22T12:38:51.368Z`
- Dataset: `/Users/marbaced/tmp/cfhack2026/frugal-code/evaluation_data/evaluation_dataset_highScattered.csv`
- Rows evaluated: **30**
- Direct small model: `gpt-oss-120b-working`
- Direct large model: `minimax-m2.5-229b`
- Middleware models: `middleware:simple`, `middleware:onnx`, `middleware:llm`
- Direct-model agreement: **18/30**
- Direct-model disagreement: **12/30**

## Scoreboard

| Name | Kind | Accuracy | Correct | Thinking Rows | Agree w/ Small | Agree w/ Large |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `gpt-oss-120b-working` | direct | 50.00% | 15/30 | 30/30 | 30/30 | 18/30 |
| `minimax-m2.5-229b` | direct | 53.33% | 16/30 | 30/30 | 18/30 | 29/30 |
| `middleware:simple` | middleware | 53.33% | 16/30 | 30/30 | 18/30 | 29/30 |
| `middleware:onnx` | middleware | 53.33% | 16/30 | 30/30 | 25/30 | 22/30 |
| `middleware:llm` | middleware | 53.33% | 16/30 | 30/30 | 29/30 | 19/30 |

## Routing Notes

### middleware:simple

- Routed backends: `minimax-m2.5-229b` (30)
- Total wall time: 2636053 ms, average per query: 87868.4 ms
- Known token split: answer=58, reasoning=64380

### middleware:onnx

- Routed backends: `gpt-oss-120b-working` (15), `minimax-m2.5-229b` (15)
- Total wall time: 293637 ms, average per query: 9787.9 ms
- Known token split: answer=43, reasoning=29187

### middleware:llm

- Routed backends: `gpt-oss-120b-working` (29), `minimax-m2.5-229b` (1)
- Total wall time: 104506 ms, average per query: 3483.5 ms
- Known token split: answer=31, reasoning=10638
