$ErrorActionPreference = "Stop"

$python = "C:\Users\ckda5\Anaconda3\envs\onboarding\python.exe"
$inputCsv = "data/arena_hard_training_no_both_bad/arena_hard_training_dedup.csv"
$outDir = "artifacts/arena_hard_transformers"

$runs = @(
    @{
        Model = "roberta-base"
        TrainBatch = 8
        EvalBatch = 16
    }
)

foreach ($run in $runs) {
    $model = $run.Model
    Write-Host "=== Training $model ==="
    try {
        & $python scripts/train_arena_hard_transformer.py `
            --input-csv $inputCsv `
            --model-name $model `
            --out-dir $outDir `
            --epochs 2 `
            --train-batch-size $run.TrainBatch `
            --eval-batch-size $run.EvalBatch `
            --max-length 256 `
            --bf16 `
            --local-files-only
    }
    catch {
        Write-Host "FAILED: $model"
        Write-Host $_
    }
}
