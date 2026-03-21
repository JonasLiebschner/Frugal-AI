/**
 * Evaluation against DevQuasar/llm_router_dataset-synth (local copy)
 * https://huggingface.co/datasets/DevQuasar/llm_router_dataset-synth
 *
 * label 0 → small_llm → QueryComplexity.Small
 * label 1 → large_llm → QueryComplexity.Large
 *
 * Download dataset first: bun run data/download.ts
 * Run eval:               bun test classifier.eval.test.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { QueryComplexity } from "shared";
import { HeuristicClassifier } from "./classifier";

interface Row {
  prompt: string;
  label: number;
}

interface Sample {
  prompt: string;
  expected: QueryComplexity;
}

let samples: Sample[] = [];

beforeAll(async () => {
  const file = Bun.file(new URL("./data/llm_router_dataset.json", import.meta.url));
  const rows = (await file.json()) as Row[];

  for (const row of rows) {
    samples.push({
      prompt: row.prompt,
      expected: row.label === 1 ? QueryComplexity.Large : QueryComplexity.Small,
    });
  }
});

describe("HeuristicClassifier vs llm_router_dataset-synth", () => {
  test("dataset loaded correctly", () => {
    expect(samples.length).toBeGreaterThan(0);
    const large = samples.filter((s) => s.expected === QueryComplexity.Large);
    const small = samples.filter((s) => s.expected === QueryComplexity.Small);
    console.log(`\nDataset: ${large.length} large, ${small.length} small (total ${samples.length})`);
  });

  test("overall accuracy >= 60%", () => {
    const classifier = new HeuristicClassifier();
    let correct = 0;
    const errors: { prompt: string; expected: string; got: string; score: number }[] = [];

    for (const { prompt, expected } of samples) {
      const { result, additionalData } = classifier.classify(prompt);
      const score = (additionalData?.classification as any)?.score ?? 0;
      if (result === expected) {
        correct++;
      } else {
        errors.push({ prompt: prompt.slice(0, 80), expected, got: result, score });
      }
    }

    const accuracy = correct / samples.length;
    const pct = (accuracy * 100).toFixed(1);

    // breakdown
    const largeSamples = samples.filter((s) => s.expected === QueryComplexity.Large);
    const smallSamples = samples.filter((s) => s.expected === QueryComplexity.Small);
    const largeCorrect = largeSamples.filter((s) => classifier.classify(s.prompt).result === s.expected).length;
    const smallCorrect = smallSamples.filter((s) => classifier.classify(s.prompt).result === s.expected).length;

    console.log(`\nAccuracy:       ${pct}% (${correct}/${samples.length})`);
    console.log(`Large recall:   ${((largeCorrect / largeSamples.length) * 100).toFixed(1)}% (${largeCorrect}/${largeSamples.length})`);
    console.log(`Small recall:   ${((smallCorrect / smallSamples.length) * 100).toFixed(1)}% (${smallCorrect}/${smallSamples.length})`);

    if (errors.length > 0) {
      console.log(`\nSample misclassifications (first 10):`);
      errors.slice(0, 10).forEach((e) => {
        console.log(`  [expected=${e.expected} got=${e.got} score=${e.score}] "${e.prompt}"`);
      });
    }

    expect(accuracy).toBeGreaterThanOrEqual(0.6);
  });
});
