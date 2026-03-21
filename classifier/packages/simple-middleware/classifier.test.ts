import { test, expect, describe } from "bun:test";
import { QueryComplexity } from "shared";
import { HeuristicClassifier } from "./classifier";

const classifier = new HeuristicClassifier();

describe("HeuristicClassifier", () => {
  describe("small queries", () => {
    test("short factual question", () => {
      expect(classifier.classify("What is TypeScript?").result).toBe(QueryComplexity.Small);
    });

    test("simple definition", () => {
      expect(classifier.classify("Define polymorphism").result).toBe(QueryComplexity.Small);
    });

    test("who question", () => {
      expect(classifier.classify("Who is Alan Turing?").result).toBe(QueryComplexity.Small);
    });

    test("very short query", () => {
      expect(classifier.classify("Sort array").result).toBe(QueryComplexity.Small);
    });

    test("translate request", () => {
      expect(classifier.classify("Translate hello to Spanish").result).toBe(QueryComplexity.Small);
    });

    test("short explain is small", () => {
      expect(classifier.classify("Explain how garbage collection works").result).toBe(QueryComplexity.Small);
    });

    test("which question stays small", () => {
      expect(classifier.classify("Which is faster, npm or bun?").result).toBe(QueryComplexity.Small);
    });

    test("short imperative list request stays small", () => {
      expect(classifier.classify("List HTTP status codes").result).toBe(QueryComplexity.Small);
    });

    test("very short debug request is still small", () => {
      expect(classifier.classify("Debug app").result).toBe(QueryComplexity.Small);
    });
  });

  describe("large queries", () => {
    test("long explain is large", () => {
      expect(classifier.classify("Explain how garbage collection works in the JVM and how it differs from reference counting").result).toBe(QueryComplexity.Large);
    });

    test("compare keyword", () => {
      expect(classifier.classify("Compare REST and GraphQL").result).toBe(QueryComplexity.Large);
    });

    test("long query exceeds char threshold", () => {
      const long = "a ".repeat(110).trim(); // > 200 chars
      expect(classifier.classify(long).result).toBe(QueryComplexity.Large);
    });

    test("query exceeds word threshold", () => {
      const manyWords = Array.from({ length: 36 }, (_, i) => `word${i}`).join(" ");
      expect(classifier.classify(manyWords).result).toBe(QueryComplexity.Large);
    });

    test("multiple sentences", () => {
      expect(classifier.classify("This is sentence one. This is sentence two. And a third one.").result).toBe(QueryComplexity.Large);
    });

    test("implement keyword", () => {
      expect(classifier.classify("Implement a binary search tree").result).toBe(QueryComplexity.Large);
    });

    test("step by step keyword", () => {
      expect(classifier.classify("How to deploy step by step").result).toBe(QueryComplexity.Large);
    });

    test("production-ready keyword", () => {
      expect(classifier.classify("Build a production-ready auth service with monitoring and rate limiting").result).toBe(QueryComplexity.Large);
    });

    test("weak troubleshooting keyword with enough context", () => {
      expect(classifier.classify("Troubleshoot why my Docker build fails in CI after enabling multi-stage caching").result).toBe(QueryComplexity.Large);
    });

    test("multi-part connector signal", () => {
      expect(classifier.classify("Should I use Redis and Postgres for sessions and caching in production for my API service?").result).toBe(QueryComplexity.Large);
    });
  });

  describe("details field", () => {
    test("always returns details.classification", () => {
      const { details } = classifier.classify("What is TypeScript?");
      expect(details?.classification).toBeDefined();
    });

    test("classifier_type is heuristic", () => {
      const { details } = classifier.classify("What is TypeScript?");
      expect((details?.classification as any).classifier_type).toBe("heuristic");
    });

    test("score is between 0 and 1", () => {
      for (const query of ["Sort array", "Compare REST and GraphQL", "Explain garbage collection"]) {
        const { details } = classifier.classify(query);
        const score = (details?.classification as any).score as number;
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    test("reason is a non-empty string", () => {
      const { details } = classifier.classify("Implement a binary search tree");
      expect(typeof (details?.classification as any).reason).toBe("string");
      expect((details?.classification as any).reason.length).toBeGreaterThan(0);
    });
  });
});

describe("createClassifyServer integration", () => {
  test("POST /api/v1/classify returns small for short query", async () => {
    const { createClassifyServer } = await import("shared");
    const server = createClassifyServer(classifier, 0); // port 0 = random free port

    const res = await fetch(`http://localhost:${server.port}/api/v1/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "What is TypeScript?" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBe(QueryComplexity.Small);

    server.stop();
  });

  test("POST /api/v1/classify returns large for complex query", async () => {
    const { createClassifyServer } = await import("shared");
    const server = createClassifyServer(classifier, 0);

    const res = await fetch(`http://localhost:${server.port}/api/v1/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Explain the tradeoffs between microservices and monoliths" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBe(QueryComplexity.Large);

    server.stop();
  });

  test("POST /api/v1/classify returns 400 for missing query", async () => {
    const { createClassifyServer } = await import("shared");
    const server = createClassifyServer(classifier, 0);

    const res = await fetch(`http://localhost:${server.port}/api/v1/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    server.stop();
  });

  test("POST /api/v1/classify returns 400 for invalid JSON", async () => {
    const { createClassifyServer } = await import("shared");
    const server = createClassifyServer(classifier, 0);

    const res = await fetch(`http://localhost:${server.port}/api/v1/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    server.stop();
  });
});
