import { type Classifier, type ClassifyResult, QueryComplexity } from "shared";

const STRONG_LARGE_KEYWORDS = [
  "compare",
  "contrast",
  "difference between",
  "implement",
  "build",
  "create",
  "develop",
  "design",
  "system design",
  "architecture",
  "distributed",
  "distributed system",
  "refactor",
  "optimize",
  "optimization",
  "evaluate",
  "assess",
  "pros and cons",
  "trade-offs",
  "trade offs",
  "tradeoffs",
  "step by step",
  "deep dive",
  "in depth",
  "in detail",
  "elaborate",
  "end to end",
  "end-to-end",
  "from scratch",
  "best practices",
  "production ready",
  "production-ready",
  "scalability",
  "scale to",
  "migration plan",
  "benchmark",
  "decision matrix",
];

const WEAK_LARGE_KEYWORDS = [
  "explain",
  "analyze",
  "analyse",
  "summarize",
  "summarise",
  "why does",
  "why is",
  "why are",
  "how does",
  "how do",
  "how can",
  "how should",
  "walk me through",
  "debug",
  "diagnose",
  "troubleshoot",
  "investigate",
  "improve",
  "recommend",
  "suggest",
  "approach",
  "strategy",
  "plan",
  "review",
];

const SMALL_PREFIX_KEYWORDS = [
  "what is",
  "what are",
  "who is",
  "who are",
  "when is",
  "when was",
  "where is",
  "where are",
  "which is",
  "which are",
  "define",
  "translate",
  "convert",
  "list",
  "name",
  "spell",
  "meaning of",
];

const SMALL_IMPERATIVE_KEYWORDS = ["define", "translate", "convert", "list", "name", "spell"];
const COMPLEXITY_CONNECTORS = [" and ", " versus ", " vs ", " tradeoff ", " tradeoffs ", " trade offs ", " pros and cons "];

const CHAR_THRESHOLD = 200;
const WORD_THRESHOLD = 35;
const SENTENCE_THRESHOLD = 3;
const WEAK_KEYWORD_WORD_MIN = 8; // weak keywords only count if query has more than this many words
const DEFAULT_LARGE_WORD_MIN = 10; // unrecognised queries above this word count default to large

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileKeyword(keyword: string): RegExp {
  const escaped = escapeRegExp(keyword).replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, "i");
}

const STRONG_LARGE_PATTERNS = STRONG_LARGE_KEYWORDS.map((keyword) => ({ keyword, pattern: compileKeyword(keyword) }));
const WEAK_LARGE_PATTERNS = WEAK_LARGE_KEYWORDS.map((keyword) => ({ keyword, pattern: compileKeyword(keyword) }));

function findMatches(text: string, keywords: ReadonlyArray<{ keyword: string; pattern: RegExp }>): string[] {
  return keywords.filter((entry) => entry.pattern.test(text)).map((entry) => entry.keyword);
}

function startsWithKeyword(text: string, keywords: readonly string[]): string | undefined {
  return keywords.find((keyword) => text === keyword || text.startsWith(`${keyword} `));
}

export class HeuristicClassifier implements Classifier {
  classify(query: string): ClassifyResult {
    const lower = normalizeQuery(query);
    const wordCount = lower.length > 0 ? lower.split(/\s+/).filter(Boolean).length : 0;
    const sentenceCount = query.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
    const questionCount = (query.match(/\?/g) ?? []).length;

    const signal = (result: QueryComplexity, score: number, reason: string): ClassifyResult => ({
      result,
      additionalData: {
        classification: {
          score,
          reason,
          classifier_type: "heuristic",
        },
      },
    });

    // Hard length signals
    if (query.length > CHAR_THRESHOLD)
      return signal(QueryComplexity.Large, 1.0, `Query exceeds ${CHAR_THRESHOLD} characters`);
    if (wordCount > WORD_THRESHOLD)
      return signal(QueryComplexity.Large, 1.0, `Query exceeds ${WORD_THRESHOLD} words`);
    if (sentenceCount >= SENTENCE_THRESHOLD)
      return signal(QueryComplexity.Large, 0.9, `Query contains ${sentenceCount} sentences`);

    // Strong keywords — always large
    const strongMatches = findMatches(lower, STRONG_LARGE_PATTERNS);
    if (strongMatches.length > 0) {
      const preview = strongMatches.slice(0, 2).join(", ");
      return signal(QueryComplexity.Large, 0.86, `Strong keyword matched: ${preview}`);
    }

    // Multi-part intent often implies a complex answer.
    if (wordCount > 12) {
      const connectorHits = COMPLEXITY_CONNECTORS.filter((connector) => lower.includes(connector));
      if (connectorHits.length > 0)
        return signal(QueryComplexity.Large, 0.72, `Multi-part query signaled by connector: "${connectorHits[0].trim()}"`);
    }

    // Weak keywords — only large if the query has enough words to be non-trivial.
    if (wordCount > WEAK_KEYWORD_WORD_MIN) {
      const weakMatches = findMatches(lower, WEAK_LARGE_PATTERNS);
      if (weakMatches.length > 0) {
        const preview = weakMatches.slice(0, 2).join(", ");
        return signal(QueryComplexity.Large, 0.67, `Weak keyword matched: ${preview} (${wordCount} words)`);
      }
    }

    // Small keyword prefix — explicit simple questions
    const smallPrefix = startsWithKeyword(lower, SMALL_PREFIX_KEYWORDS);
    if (smallPrefix)
      return signal(QueryComplexity.Small, 0.1, `Small keyword prefix matched: "${smallPrefix}"`);

    // Short imperative single-shot requests.
    if (wordCount <= 6) {
      const shortImperative = startsWithKeyword(lower, SMALL_IMPERATIVE_KEYWORDS);
      if (shortImperative)
        return signal(QueryComplexity.Small, 0.15, `Short imperative matched: "${shortImperative}" (${wordCount} words)`);
    }

    // Default: short queries are small, longer ones are large
    if (wordCount <= 3)
      return signal(QueryComplexity.Small, 0.12, `Very short query (${wordCount} words), treated as simple`);
    if (questionCount === 1 && sentenceCount === 1 && wordCount <= 8)
      return signal(QueryComplexity.Small, 0.22, `Single short question (${wordCount} words), no strong complexity signals`);
    if (wordCount <= DEFAULT_LARGE_WORD_MIN)
      return signal(QueryComplexity.Small, 0.2, `Short query (${wordCount} words), no keyword signals`);

    return signal(QueryComplexity.Large, 0.7, `Medium-length query (${wordCount} words), no small keyword signals`);
  }
}
