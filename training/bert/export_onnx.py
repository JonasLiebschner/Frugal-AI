import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from onnxruntime.quantization import quantize_dynamic, QuantType
from classifier.config import MODEL_SAVE_DIR, MAX_SEQ_LENGTH

ONNX_PATH = f"{MODEL_SAVE_DIR}/model.onnx"
ONNX_INT8_PATH = f"{MODEL_SAVE_DIR}/model_int8.onnx"


def export():
    print(f"Loading model from {MODEL_SAVE_DIR}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_SAVE_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_SAVE_DIR)
    model.eval()

    dummy = tokenizer(
        "dummy input for tracing",
        return_tensors="pt",
        truncation=True,
        max_length=MAX_SEQ_LENGTH,
        padding="max_length",
    )
    input_ids = dummy["input_ids"]
    attention_mask = dummy["attention_mask"]

    print(f"Exporting to {ONNX_PATH}...")
    torch.onnx.export(
        model,
        (input_ids, attention_mask),
        ONNX_PATH,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size"},
        },
        opset_version=18,
        dynamo=False,
    )
    print(f"Exported to {ONNX_PATH}")

    print(f"Quantizing to int8 at {ONNX_INT8_PATH}...")
    quantize_dynamic(ONNX_PATH, ONNX_INT8_PATH, weight_type=QuantType.QInt8)
    print(f"Quantized model saved to {ONNX_INT8_PATH}")


if __name__ == "__main__":
    export()
