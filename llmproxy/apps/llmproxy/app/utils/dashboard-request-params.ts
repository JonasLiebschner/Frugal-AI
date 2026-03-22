import type { RequestFieldRow } from "../types/dashboard";
import { formatCompactValue } from "./formatters";
import { isClientRecord } from "./guards";

export function buildRequestParamRows(
  requestBody: unknown,
  requestType?: "stream" | "json",
): RequestFieldRow[] {
  const derivedRequestType =
    requestType ||
    (isClientRecord(requestBody) && typeof requestBody.stream === "boolean"
      ? (requestBody.stream ? "stream" : "json")
      : undefined);

  const items: RequestFieldRow[] = [];

  if (derivedRequestType) {
    items.push({
      key: "type",
      value: derivedRequestType,
      title: "Whether the client requested a streaming response or a regular JSON response.",
    });
  }

  if (!isClientRecord(requestBody)) {
    return items;
  }

  return items.concat(
    Object.entries(requestBody)
      .filter(([key, value]) => key !== "messages" && key !== "tools" && key !== "stream" && value !== undefined)
      .map(([key, value]) => ({
        key,
        value: formatCompactValue(value),
        title: describeRequestField(key),
      })),
  );
}

function describeRequestField(key: string): string {
  const normalized = key.trim();

  switch (normalized) {
    case "model":
      return "Model requested by the client. This can be a concrete model name or a routing alias such as auto.";
    case "max_completion_tokens":
      return "Maximum number of completion tokens the model is allowed to generate for this response. When reached, generation usually stops with finish reason \"length\".";
    case "max_tokens":
      return "Alternate maximum completion-token limit for this request. llmproxy uses it when max_completion_tokens is not present.";
    case "temperature":
      return "Sampling temperature. Lower values make the response more deterministic; higher values make it more varied and creative.";
    case "top_p":
      return "Nucleus sampling threshold. The model samples only from the smallest probability mass whose total reaches this value.";
    case "top_k":
      return "Top-k sampling limit. The model samples only from the highest-probability candidate tokens up to this count.";
    case "min_p":
      return "Minimum probability threshold for token candidates. Lower-probability options below this threshold are filtered out.";
    case "repeat_penalty":
      return "Penalty applied to already used tokens to reduce repetition and looping output.";
    case "seed":
      return "Optional random seed. When the backend supports it, the same seed can make sampling more reproducible.";
    case "tool_choice":
      return "Controls whether the model may call tools automatically, must call a specific tool, or must avoid tools.";
    case "parallel_tool_calls":
      return "Whether the model is allowed to emit multiple tool calls in parallel within one assistant turn.";
    case "response_format":
      return "Requested output format, for example structured JSON output when supported by the backend.";
    case "presence_penalty":
      return "Penalty that encourages the model to introduce new topics instead of reusing the same concepts repeatedly.";
    case "frequency_penalty":
      return "Penalty that discourages repeatedly using the same tokens or phrases.";
    case "stop":
      return "Custom stop sequence or sequences. Generation ends when one of them is reached.";
    case "n":
      return "Number of completions requested for this call. Most llmproxy flows typically use a single response.";
    case "user":
      return "Optional end-user identifier passed through for abuse monitoring, analytics, or downstream policy handling.";
    default:
      return `Top-level request field "${normalized}". If you set it explicitly, llmproxy forwarded this parameter to the backend request.`;
  }
}
