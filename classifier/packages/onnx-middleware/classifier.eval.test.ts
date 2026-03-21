/**
 * Evaluation of OnnxClassifier against DevQuasar/llm_router_dataset-synth.
 *
 * Requires the local dataset cache from simple-middleware:
 *   bun run ../simple-middleware/data/download.ts
 *
 * Run: bun test classifier.eval.test.ts
 *
 * NOTE: This model was not trained specifically for LLM routing —
 * accuracy reflects the model provided. A purpose-trained model will score higher.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { QueryComplexity } from "shared";
import { createOnnxClassifier } from "./classifier";
import type { OnnxClassifier } from "./classifier";

const DATASET_PATH = "../simple-middleware/data/llm_router_dataset.json";
//const MODEL_PATH = "./model_output/model_int8.onnx";
//const TOKENIZER_PATH = "./model_output/tokenizer.json";
const MODEL_PATH = "./model_test/model.onnx";
const TOKENIZER_PATH = "./model_test/tokenizer.json";
const SAMPLE_PER_CLASS = 100; // keep eval fast

interface Row {
  prompt: string;
  label: number;
}
interface Sample {
  prompt: string;
  expected: QueryComplexity;
}

let classifier: OnnxClassifier;
let samples: Sample[] = [];

beforeAll(async () => {
  classifier = await createOnnxClassifier({
    modelPath: MODEL_PATH,
    tokenizerPath: TOKENIZER_PATH,
  });

  const rows = (await Bun.file(DATASET_PATH).json()) as Row[];
  const large = rows.filter((r) => r.label === 1).slice(0, SAMPLE_PER_CLASS);
  const small = rows.filter((r) => r.label === 0).slice(0, SAMPLE_PER_CLASS);

  for (const r of large)
    samples.push({ prompt: r.prompt, expected: QueryComplexity.Large });
  for (const r of small)
    samples.push({ prompt: r.prompt, expected: QueryComplexity.Small });
}, 60_000);

describe("OnnxClassifier vs llm_router_dataset-synth", () => {
  test("dataset loaded", () => {
    expect(samples.length).toBe(SAMPLE_PER_CLASS * 2);
  });

  test("overall accuracy >= 50%", async () => {
    let correct = 0;
    const errors: {
      prompt: string;
      expected: string;
      got: string;
      score: number;
    }[] = [];

    for (const { prompt, expected } of samples) {
      const { result, additionalData } = await classifier.classify(prompt);
      const score = (additionalData?.classification as any)?.score ?? 0;
      if (result === expected) {
        correct++;
      } else {
        errors.push({
          prompt: prompt.slice(0, 80),
          expected,
          got: result,
          score,
        });
      }
    }

    const accuracy = correct / samples.length;
    const largeCorrect = samples
      .filter((s) => s.expected === QueryComplexity.Large)
      .filter(
        async (s) =>
          (await classifier.classify(s.prompt)).result === s.expected,
      ).length;

    // Per-class breakdown
    const largeSamples = samples.filter(
      (s) => s.expected === QueryComplexity.Large,
    );
    const smallSamples = samples.filter(
      (s) => s.expected === QueryComplexity.Small,
    );
    let largeHits = 0,
      smallHits = 0;
    for (const s of samples) {
      const { result } = await classifier.classify(s.prompt);
      if (result === s.expected) {
        if (s.expected === QueryComplexity.Large) largeHits++;
        else smallHits++;
      }
    }

    console.log(
      `\nAccuracy:      ${(accuracy * 100).toFixed(1)}% (${correct}/${samples.length})`,
    );
    console.log(
      `Large recall:  ${((largeHits / largeSamples.length) * 100).toFixed(1)}% (${largeHits}/${largeSamples.length})`,
    );
    console.log(
      `Small recall:  ${((smallHits / smallSamples.length) * 100).toFixed(1)}% (${smallHits}/${smallSamples.length})`,
    );

    if (errors.length > 0) {
      console.log(`\nSample misclassifications (first 8):`);
      errors
        .slice(0, 8)
        .forEach((e) =>
          console.log(
            `  [expected=${e.expected} got=${e.got} score=${e.score}] "${e.prompt}"`,
          ),
        );
    }

    expect(accuracy).toBeGreaterThanOrEqual(0.5);
  }, 120_000);
});
