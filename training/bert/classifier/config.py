from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent

MODEL_NAME = "answerdotai/ModernBERT-base"
MODEL_VERSION = "v3"
MODEL_SAVE_DIR = str(_ROOT / "model" / MODEL_VERSION)
AUGMENTED_DATASET_DIR = str(_ROOT / "data" / "v2_augmented")
ONNX_INT8_PATH = f"{MODEL_SAVE_DIR}/model_int8.onnx"
MAX_SEQ_LENGTH = 128
LABEL_TO_STR = {0: "small", 1: "large"}
DATASET_NAME = "DevQuasar/llm_router_dataset-synth"

# Training hyperparameters
TRAIN_BATCH_SIZE = 4
EVAL_BATCH_SIZE = 16
MAX_TRAIN_SAMPLES = 23_688  # half of full augmented dataset (47,376)
TRAIN_SAMPLE_SEED = 42
NUM_EPOCHS = 3
LEARNING_RATE = 2e-5
WEIGHT_DECAY = 0.01
WARMUP_RATIO = 0.1
