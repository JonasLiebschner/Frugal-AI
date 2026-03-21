$ErrorActionPreference = "Stop"

$python = "C:\Users\ckda5\Anaconda3\envs\onboarding\python.exe"

& $python scripts/train_arena_hard_transformer.py `
    --input-csv "data/arena_hard_training_no_both_bad/arena_hard_training_dedup.csv" `
    --model-name "sentence-transformers/all-roberta-large-v1" `
    --out-dir "artifacts/arena_hard_transformers" `
    --epochs 2 `
    --train-batch-size 4 `
    --eval-batch-size 8 `
    --max-length 256 `
    --bf16 `
    --local-files-only
