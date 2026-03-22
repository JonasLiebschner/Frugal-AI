import time
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

from classifier.config import MODEL_SAVE_DIR, MAX_SEQ_LENGTH, LABEL_TO_STR, ONNX_INT8_PATH

ONNX_PATH = ONNX_INT8_PATH


def load_session(onnx_path: str) -> ort.InferenceSession:
    providers = ["CPUExecutionProvider"]
    return ort.InferenceSession(onnx_path, providers=providers)


def predict(session: ort.InferenceSession, tokenizer, query: str) -> tuple[str, float, float]:
    inputs = tokenizer(
        query,
        return_tensors="np",
        truncation=True,
        max_length=MAX_SEQ_LENGTH,
        padding=True,
    )
    feeds = {
        "input_ids": inputs["input_ids"].astype(np.int64),
        "attention_mask": inputs["attention_mask"].astype(np.int64),
    }
    t0 = time.perf_counter()
    logits = session.run(["logits"], feeds)[0]
    elapsed_ms = (time.perf_counter() - t0) * 1000

    exp = np.exp(logits - logits.max(axis=-1, keepdims=True))
    probs = exp / exp.sum(axis=-1, keepdims=True)
    label_idx = int(probs.argmax(axis=-1)[0])
    confidence = float(probs[0, label_idx])
    return LABEL_TO_STR[label_idx], confidence, elapsed_ms


def main():
    print(f"Loading tokenizer from {MODEL_SAVE_DIR}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_SAVE_DIR)

    print(f"Loading ONNX session from {ONNX_PATH}...")
    session = load_session(ONNX_PATH)

    print("Ready. Type a query and press Enter (Ctrl+C to quit).\n")
    while True:
        try:
            query = input("> ").strip()
        except (KeyboardInterrupt, EOFError):
            print()
            break
        if not query:
            continue
        label, confidence, elapsed_ms = predict(session, tokenizer, query)
        print(f"{label}  (confidence: {confidence:.4f}, {elapsed_ms:.1f}ms)\n")


if __name__ == "__main__":
    main()
