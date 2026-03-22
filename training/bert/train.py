import os
import torch
from datasets import load_dataset, load_from_disk
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)
from sklearn.metrics import accuracy_score, f1_score
import numpy as np

from classifier.config import (
    MODEL_NAME,
    MODEL_SAVE_DIR,
    AUGMENTED_DATASET_DIR,
    MAX_SEQ_LENGTH,
    LABEL_TO_STR,
    DATASET_NAME,
    TRAIN_BATCH_SIZE,
    EVAL_BATCH_SIZE,
    NUM_EPOCHS,
    LEARNING_RATE,
    WEIGHT_DECAY,
    WARMUP_RATIO,
    MAX_TRAIN_SAMPLES,
    TRAIN_SAMPLE_SEED,
)


def detect_device() -> str:
    if torch.backends.mps.is_available() and torch.backends.mps.is_built():
        return "mps"
    return "cpu"


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    return {
        "accuracy": accuracy_score(labels, predictions),
        "f1": f1_score(labels, predictions, average="binary"),
    }


def train():
    device = detect_device()
    print(f"Using device: {device}")

    if os.path.exists(AUGMENTED_DATASET_DIR):
        print(f"Loading augmented train dataset from {AUGMENTED_DATASET_DIR}")
        train_ds = load_from_disk(AUGMENTED_DATASET_DIR)
    else:
        print(f"Augmented dataset not found, loading from {DATASET_NAME}")
        train_ds = load_dataset(DATASET_NAME, split="train")

    if MAX_TRAIN_SAMPLES and len(train_ds) > MAX_TRAIN_SAMPLES:
        train_ds = train_ds.shuffle(seed=TRAIN_SAMPLE_SEED).select(range(MAX_TRAIN_SAMPLES))
        print(f"Sampled {MAX_TRAIN_SAMPLES} rows (seed={TRAIN_SAMPLE_SEED})")

    # Always use HuggingFace test split for consistent comparison across versions
    test_ds = load_dataset(DATASET_NAME, split="test")

    label2id = {"small": 0, "large": 1}
    id2label = {v: k for k, v in label2id.items()}

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

    def tokenize(batch):
        return tokenizer(
            batch["prompt"],
            truncation=True,
            max_length=MAX_SEQ_LENGTH,
            padding=False,
        )

    train_tokenized = train_ds.map(tokenize, batched=True, remove_columns=["prompt"])
    test_tokenized = test_ds.map(tokenize, batched=True, remove_columns=["prompt"])

    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=2,
        id2label=id2label,
        label2id=label2id,
    )

    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

    training_args = TrainingArguments(
        output_dir=MODEL_SAVE_DIR,
        num_train_epochs=NUM_EPOCHS,
        per_device_train_batch_size=TRAIN_BATCH_SIZE,
        per_device_eval_batch_size=EVAL_BATCH_SIZE,
        learning_rate=LEARNING_RATE,
        weight_decay=WEIGHT_DECAY,
        warmup_ratio=WARMUP_RATIO,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        use_cpu=False,
        fp16=False,
        bf16=False,
        dataloader_num_workers=0,
        report_to="none",
        gradient_checkpointing=True,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_tokenized,
        eval_dataset=test_tokenized,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
    )

    trainer.train()
    trainer.save_model(MODEL_SAVE_DIR)
    tokenizer.save_pretrained(MODEL_SAVE_DIR)
    print(f"Model saved to {MODEL_SAVE_DIR}")


if __name__ == "__main__":
    train()
