import * as ort from "onnxruntime-node";
import { type Classifier, type ClassifyResult, QueryComplexity } from "shared";
import { HFTokenizer } from "./tokenizer";

export interface OnnxClassifierOptions {
  /** Path to the .onnx model file */
  modelPath: string;
  /** Path to the tokenizer.json file (produced by train.py) */
  tokenizerPath: string;
  /** Max sequence length (default: 128) */
  maxLen?: number;
}

// Numerically stable softmax matching the Python inference code
function softmax(logits: Float32Array): number[] {
  const max = Math.max(...logits);
  const exps = Array.from(logits).map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export class OnnxClassifier implements Classifier {
  private session: ort.InferenceSession | null = null;
  private tokenizer: HFTokenizer | null = null;
  private readonly options: Required<OnnxClassifierOptions>;

  constructor(options: OnnxClassifierOptions) {
    this.options = { maxLen: 128, ...options };
  }

  async load(): Promise<void> {
    [this.session, this.tokenizer] = await Promise.all([
      ort.InferenceSession.create(this.options.modelPath),
      HFTokenizer.fromFile(this.options.tokenizerPath, this.options.maxLen),
    ]);
  }

  async classify(query: string): Promise<ClassifyResult> {
    if (!this.session || !this.tokenizer) {
      throw new Error("OnnxClassifier not loaded — call load() before classify()");
    }

    const { input_ids, attention_mask } = this.tokenizer.encode(query);

    const feeds = {
      input_ids: new ort.Tensor("int64", input_ids, [1, this.options.maxLen]),
      attention_mask: new ort.Tensor("int64", attention_mask, [1, this.options.maxLen]),
    };

    const output = await this.session.run(feeds);
    const logits = output["logits"]!.data as Float32Array;

    // Softmax + argmax — matches the Python inference exactly
    const probs = softmax(logits);
    const labelIdx = probs[0]! > probs[1]! ? 0 : 1;
    const confidence = probs[labelIdx]!;
    const result = labelIdx === 1 ? QueryComplexity.Large : QueryComplexity.Small;

    return {
      result,
      additionalData: {
        classification: {
          score: Math.round(confidence * 1000) / 1000,
          reason: `ONNX confidence: ${(confidence * 100).toFixed(1)}% (label_idx: ${labelIdx})`,
          classifier_type: "onnx",
          model_path: this.options.modelPath,
          probs: { small: Math.round(probs[0]! * 1000) / 1000, large: Math.round(probs[1]! * 1000) / 1000 },
        },
      },
    };
  }
}

export async function createOnnxClassifier(options: OnnxClassifierOptions): Promise<OnnxClassifier> {
  const classifier = new OnnxClassifier(options);
  await classifier.load();
  return classifier;
}
