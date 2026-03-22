import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

from classifier.config import MAX_SEQ_LENGTH, LABEL_TO_STR


class LLMRouterPredictor:
    def __init__(self, model_dir: str):
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
        self.session = ort.InferenceSession(
            f"{model_dir}/model_int8.onnx",
            providers=["CPUExecutionProvider"],
        )

    def predict(self, query: str) -> str:
        inputs = self.tokenizer(
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
        logits = self.session.run(["logits"], feeds)[0]
        return LABEL_TO_STR[int(logits.argmax(axis=-1)[0])]
