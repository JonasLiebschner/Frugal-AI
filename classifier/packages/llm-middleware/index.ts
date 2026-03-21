import { createClassifyServer } from "shared";
import { LLMClassifier } from "./classifier";

const port = Number(process.env.PORT) || 3002;

const classifier = new LLMClassifier({
  baseURL: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,
  model: process.env.LLM_MODEL,
});

const server = createClassifyServer(classifier, {
  port,
  title: "LLM Classify Middleware",
  description: "Query complexity classifier powered by an LLM via OpenAI-compatible API",
  version: "1.0.0",
});

console.log(`llm-middleware listening on http://localhost:${server.port}`);
console.log(`Backend: ${process.env.LLM_BASE_URL ?? "https://api.openai.com/v1"}`);
console.log(`Model:   ${process.env.LLM_MODEL ?? "gpt-4o-mini"}`);
