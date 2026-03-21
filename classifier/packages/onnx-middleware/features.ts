/**
 * Text feature extraction for ONNX model input.
 *
 * Produces a fixed-size Float32Array of FEATURE_SIZE elements.
 * The model must be trained with the same feature schema — see below.
 *
 * Feature schema (index → meaning):
 *   [0]  charLength         — normalized character count (chars / 500)
 *   [1]  wordCount          — normalized word count (words / 50)
 *   [2]  sentenceCount      — normalized sentence count (sentences / 10)
 *   [3]  avgWordLength      — average word length in characters (/ 15)
 *   [4]  hasStrongKeyword   — 1 if a strong complexity keyword is present, else 0
 *   [5]  hasWeakKeyword     — 1 if a weak complexity keyword is present, else 0
 *   [6]  hasSmallKeyword    — 1 if a simple/small keyword prefix is present, else 0
 *   [7]  questionCount      — number of "?" characters (/ 5)
 */

export const FEATURE_SIZE = 8;

const STRONG_KEYWORDS = [
  "compare", "contrast", "difference between", "implement", "design",
  "architecture", "refactor", "optimize", "evaluate", "pros and cons",
  "trade-offs", "tradeoffs", "step by step", "in depth", "in detail", "elaborate",
];

const WEAK_KEYWORDS = [
  "explain", "analyze", "analyse", "summarize", "summarise",
  "why does", "why is", "how does", "how do", "debug", "diagnose",
];

const SMALL_KEYWORDS = [
  "what is", "what are", "who is", "who are", "when is",
  "when was", "where is", "define", "translate", "convert", "list", "name",
];

export function extractFeatures(query: string): Float32Array {
  const lower = query.toLowerCase().trim();
  const words = lower.split(/\s+/).filter(Boolean);
  const sentences = query.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgWordLen = words.length > 0
    ? words.reduce((sum, w) => sum + w.length, 0) / words.length
    : 0;

  const hasStrong = STRONG_KEYWORDS.some((kw) => lower.includes(kw)) ? 1 : 0;
  const hasWeak = WEAK_KEYWORDS.some((kw) => lower.includes(kw)) ? 1 : 0;
  const hasSmall = SMALL_KEYWORDS.some((kw) => lower.startsWith(kw)) ? 1 : 0;
  const questionCount = (query.match(/\?/g) ?? []).length;

  return Float32Array.from([
    Math.min(query.length / 500, 1),
    Math.min(words.length / 50, 1),
    Math.min(sentences.length / 10, 1),
    Math.min(avgWordLen / 15, 1),
    hasStrong,
    hasWeak,
    hasSmall,
    Math.min(questionCount / 5, 1),
  ]);
}
