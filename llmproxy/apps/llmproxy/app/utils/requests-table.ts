export type RequestFilterKey =
  | "issues"
  | "time"
  | "outcome"
  | "finishReason"
  | "type"
  | "request"
  | "model"
  | "middleware"
  | "routing"
  | "backend"
  | "queue"
  | "latency"
  | "tokens"
  | "maxTokens"
  | "energy"
  | "rate"
  | "note";

export type RequestSortKey = RequestFilterKey;
export type RequestSortDirection = "asc" | "desc" | "";

export interface RequestTableFilters {
  issues: string;
  time: string;
  outcome: string;
  finishReason: string;
  type: string;
  request: string;
  model: string;
  middleware: string;
  routing: string;
  backend: string;
  queueComparator: string;
  queueValue: string;
  latencyComparator: string;
  latencyValue: string;
  tokensComparator: string;
  tokensValue: string;
  maxTokensComparator: string;
  maxTokensValue: string;
  energyComparator: string;
  energyValue: string;
  rateComparator: string;
  rateValue: string;
  note: string;
}

export const requestFilterIconPath = [
  "M4 6h16",
  "M7 12h10",
  "M10 18h4",
];

export const requestNumericComparatorOptions = [
  { value: "any", label: "Any" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "eq", label: "=" },
  { value: "lte", label: "<=" },
  { value: "lt", label: "<" },
];

export const requestIssueFilterOptions = [
  { value: "all", label: "All" },
  { value: "problematic", label: "Problematic" },
  { value: "clean", label: "No issue" },
];

export const requestTypeFilterOptions = [
  { value: "all", label: "All types" },
  { value: "stream", label: "Stream" },
  { value: "json", label: "JSON" },
];

export const requestColumnTitles: Record<RequestFilterKey | "action", string> = {
  issues: "Whether llmproxy's built-in heuristic diagnostics flagged this stored request as likely problematic.",
  time: "When llmproxy first saw this request. Live rows update in place until they finish and move into retained history.",
  outcome: "Current live state or final request status such as success, error, cancelled, or rejected.",
  finishReason: "Backend finish reason for completed responses, for example stop, length, or tool_calls. Live or incomplete requests may not have one yet.",
  type: "Whether the client requested a streaming response or a regular JSON response.",
  request: "Short request identifier plus the proxied API route that was called. A yellow warning triangle marks requests where llmproxy's built-in heuristic diagnostics found a likely problem.",
  model: "Model that llmproxy actually routed this request to.",
  middleware: "Explicitly selected routing middleware for this request.",
  routing: "Routing outcome returned by the selected routing middleware before llmproxy resolved the final model.",
  backend: "Backend that currently handles or finally handled the request.",
  queue: "Time the request spent waiting for a free backend slot before execution began, or the current wait time while it is still queued.",
  latency: "Total end-to-end request duration so far for live rows, or final duration for retained history.",
  tokens: "Generated completion tokens for this request.",
  maxTokens: "Effective completion-token limit for this request, resolved from request parameters or backend model metadata when available. Unbounded cases display as infinity.",
  energy: "Estimated request energy usage in watt-hours based on the configured backend energy endpoint while the request was active.",
  rate: "Generation speed in tokens per second, when available from live or final metrics.",
  note: "Error text or other noteworthy final detail recorded for this request.",
  action: "Open the request debugger for this entry when detailed request data is available.",
};

export const requestSortLabels: Record<RequestSortKey, string> = {
  issues: "problem state",
  time: "time",
  outcome: "status",
  finishReason: "finish reason",
  type: "request type",
  request: "request",
  model: "model",
  middleware: "routing middleware",
  routing: "routing outcome",
  backend: "backend",
  queue: "queued",
  latency: "latency",
  tokens: "tokens",
  maxTokens: "max tokens",
  energy: "energy usage",
  rate: "tok/s",
  note: "note",
};
