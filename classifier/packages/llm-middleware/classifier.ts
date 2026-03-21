import OpenAI from "openai";
import { type Classifier, type ClassifyResult, QueryComplexity } from "shared";

export interface LLMClassifierOptions {
  baseURL?: string;
  apiKey?: string;
  model?: string;
}

const SYSTEM_PROMPT = `You are a query complexity classifier for an LLM routing system.
Your job is to decide whether a user query requires a large, capable model or a small, fast model.
Reply with exactly two values on one line: the routing decision and your confidence score from 0.0 to 1.0.
Format: "<decision> <confidence>" — for example "small 0.92" or "large 0.85".
No explanation, no punctuation, no extra text.`;

export class LLMClassifier implements Classifier {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: LLMClassifierOptions = {}) {
    this.client = new OpenAI({
      baseURL: options.baseURL ?? "https://api.openai.com/v1",
      apiKey: options.apiKey ?? "",
    });
    this.model = options.model ?? "gpt-4o-mini";
  }

  async classify(query: string): Promise<ClassifyResult> {
    let raw: string | null = null;

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      max_tokens: 10,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query },
      ],
    });
    raw = response.choices[0]?.message.content ?? null;

    const parts = raw?.trim().toLowerCase().split(/\s+/) ?? [];
    const decision = parts[0];
    const parsedConfidence = parts[1] !== undefined ? parseFloat(parts[1]) : NaN;
    const confidence = !isNaN(parsedConfidence) && parsedConfidence >= 0 && parsedConfidence <= 1
      ? Math.round(parsedConfidence * 1000) / 1000
      : null;

    const result = decision === "small" ? QueryComplexity.Small : QueryComplexity.Large;
    const reason =
      decision === "small" || decision === "large"
        ? `LLM returned: "${decision}"${confidence !== null ? ` (confidence: ${confidence})` : ""}`
        : `Unparseable response "${raw}", defaulting to large`;

    return {
      result,
      additionalData: {
        classification: {
          score: confidence ?? 1.0,
          reason,
          classifier_type: "llm",
          model: this.model,
          raw_response: raw,
        },
      },
    };
  }
}
