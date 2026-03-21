import { test, expect, describe } from "bun:test";
import { QueryComplexity } from "shared";

describe("OnnxClassifier", () => {
  function makeSession(logit0: number, logit1: number) {
    return {
      run: async (_feeds: unknown) => ({
        logits: { data: Float32Array.from([logit0, logit1]) },
      }),
    };
  }

  function makeTokenizer() {
    return {
      encode: () => ({
        input_ids: new BigInt64Array(128).fill(1n),
        attention_mask: new BigInt64Array(128).fill(1n),
      }),
    };
  }

  async function buildClassifier(logit0: number, logit1: number) {
    const { OnnxClassifier } = await import("./classifier");
    const c = new OnnxClassifier({ modelPath: "mock.onnx", tokenizerPath: "mock_tokenizer.json" });
    (c as any).session = makeSession(logit0, logit1);
    (c as any).tokenizer = makeTokenizer();
    return c;
  }

  test("higher logit[1] → large", async () => {
    const c = await buildClassifier(-3.0, 3.0);
    const { result } = await c.classify("some query");
    expect(result).toBe(QueryComplexity.Large);
  });

  test("higher logit[0] → small", async () => {
    const c = await buildClassifier(3.0, -3.0);
    const { result } = await c.classify("some query");
    expect(result).toBe(QueryComplexity.Small);
  });

  test("equal logits → large (conservative default)", async () => {
    const c = await buildClassifier(1.0, 1.0);
    const { result } = await c.classify("some query");
    expect(result).toBe(QueryComplexity.Large);
  });

  test("additionalData contain probs summing to ~1", async () => {
    const c = await buildClassifier(-2.0, 2.0);
    const { additionalData } = await c.classify("some query");
    const probs = (additionalData?.classification as any).probs as { small: number; large: number };
    expect(probs.small + probs.large).toBeCloseTo(1.0, 2);
  });

  test("additionalData.classification has expected fields", async () => {
    const c = await buildClassifier(-2.0, 2.0);
    const { additionalData } = await c.classify("some query");
    const cls = additionalData?.classification as Record<string, unknown>;
    expect(cls.classifier_type).toBe("onnx");
    expect(typeof cls.score).toBe("number");
    expect(typeof cls.reason).toBe("string");
    expect(cls.model_path).toBe("mock.onnx");
  });

  test("throws if classify called before load()", async () => {
    const { OnnxClassifier } = await import("./classifier");
    const c = new OnnxClassifier({ modelPath: "mock.onnx", tokenizerPath: "mock.json" });
    expect(c.classify("hello")).rejects.toThrow("not loaded");
  });
});
