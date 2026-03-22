# Baseline vs Middleware Comparison

- Generated at: `2026-03-22T11:03:29.442Z`
- Dataset: `/Users/marbaced/tmp/cfhack2026/frugal-code/evaluation_data/evaluation_dataset_highScattered.csv`
- Rows evaluated: **30**
- Direct small model: `gpt-oss-120b-working`
- Direct large model: `minimax-m2.5-229b`
- Middleware models: `middleware:simple`, `middleware:onnx`, `middleware:llm`
- Direct-model agreement: **21/30**
- Direct-model disagreement: **9/30**

## Scoreboard

| Name | Kind | Accuracy | Correct | Thinking Rows | Agree w/ Small | Agree w/ Large |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `gpt-oss-120b-working` | direct | 56.67% | 17/30 | 30/30 | 30/30 | 21/30 |
| `minimax-m2.5-229b` | direct | 50.00% | 15/30 | 30/30 | 21/30 | 30/30 |
| `middleware:simple` | middleware | 50.00% | 15/30 | 30/30 | 21/30 | 30/30 |
| `middleware:onnx` | middleware | 53.33% | 16/30 | 30/30 | 29/30 | 22/30 |
| `middleware:llm` | middleware | 56.67% | 17/30 | 30/30 | 30/30 | 21/30 |

## Routing Notes

### middleware:simple

- Routed backends: `minimax-m2.5-229b` (30)
- Total wall time: 384490 ms, average per query: 12816.3 ms
- Known token split: answer=60, reasoning=36966

### middleware:onnx

- Routed backends: `gpt-oss-120b-working` (15), `minimax-m2.5-229b` (15)
- Total wall time: 185404 ms, average per query: 6180.1 ms
- Known token split: answer=45, reasoning=17911

### middleware:llm

- Routed backends: `gpt-oss-120b-working` (29), `minimax-m2.5-229b` (1)
- Total wall time: 115120 ms, average per query: 3837.3 ms
- Known token split: answer=31, reasoning=10873
