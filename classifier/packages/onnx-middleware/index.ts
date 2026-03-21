import { createClassifyServer } from "shared";
import { existsSync } from "node:fs";
import { createOnnxClassifier } from "./classifier";

function resolveExistingPath(candidates: string[], label: string): string {
  const explicit = process.env[label];
  if (explicit) {
    return explicit;
  }

  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) {
    return found;
  }

  return candidates[0]!;
}

const modelPath = resolveExistingPath(
  [
    "/models/model_int8.onnx",
    "/models/model.onnx",
    "./model_output/model_int8.onnx",
    "./model_output/model.onnx",
    "./model_test/model.onnx",
  ],
  "MODEL_PATH",
);
const tokenizerPath = resolveExistingPath(
  [
    "/models/tokenizer.json",
    "./model_output/tokenizer.json",
    "./model_test/tokenizer.json",
  ],
  "TOKENIZER_PATH",
);

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
