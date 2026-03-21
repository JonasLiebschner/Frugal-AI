import { createClassifyServer } from "shared";
import { createOnnxClassifier } from "./classifier";

// const modelPath     = process.env.MODEL_PATH      ?? "./model_output/model_int8.onnx";
// const tokenizerPath = process.env.TOKENIZER_PATH  ?? "./model_output/tokenizer.json";
const modelPath = process.env.MODEL_PATH ?? "./model_test/model.onnx";
const tokenizerPath =
  process.env.TOKENIZER_PATH ?? "./model_test/tokenizer.json";
const port = Number(process.env.PORT) || 3001;

const classifier = await createOnnxClassifier({ modelPath, tokenizerPath });

const server = createClassifyServer(classifier, {
  port,
  title: "ONNX Classify Middleware",
  description:
    "Query complexity classifier powered by a fine-tuned ModernBERT ONNX model",
  version: "1.0.0",
});

console.log(`onnx-middleware listening on http://localhost:${server.port}`);
console.log(`Model:     ${modelPath}`);
console.log(`Tokenizer: ${tokenizerPath}`);
