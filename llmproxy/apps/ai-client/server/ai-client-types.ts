import type {
  AiClientConfig,
  AiClientSettings,
  BackendLease,
  JsonValue,
  KnownModel,
  ProxyRouteRequest,
  ProxySnapshot,
  RequestLogDetail,
  RequestLogEntry,
} from "../../shared/type-api";

export interface AiClientLoadBalancer {
  acquire(route: ProxyRouteRequest, signal?: AbortSignal): Promise<BackendLease>;
  getAiClientSettings(): AiClientSettings;
  getSnapshot(): ProxySnapshot;
  getRequestLogDetail(id: string): RequestLogDetail | undefined;
  listKnownModels(): KnownModel[];
  mergeRequestOtelDebug(requestId: string, otel: NonNullable<RequestLogDetail["otel"]>): void;
  replaceConfig(nextConfig: AiClientConfig): void;
  on(event: "snapshot", listener: () => void): unknown;
  on(event: "request_detail", listener: (requestId: string) => void): unknown;
  off(event: "snapshot", listener: () => void): unknown;
  off(event: "request_detail", listener: (requestId: string) => void): unknown;
  stop(): Promise<void>;
}

export type DiagnosticSeverity = "info" | "warn" | "bad";

export interface DiagnosticFinding {
  code:
    | "max_tokens_reached"
    | "endless_repetition"
    | "malformed_tool_call"
    | "tool_result_error"
    | "interrupted_response"
    | "request_rejected"
    | "upstream_error"
    | "cancelled"
    | "no_obvious_issue";
  severity: DiagnosticSeverity;
  title: string;
  summary: string;
  evidence: string[];
  troubleshooting: string[];
}

export interface DiagnosticFact {
  label: string;
  value: string;
}

export interface DiagnosticReport {
  requestId: string;
  generatedAt: string;
  live: boolean;
  status: RequestLogEntry["outcome"];
  summary: string;
  resolvedModel?: string;
  backendName?: string;
  finishReason?: string;
  requestTokenLimit?: number;
  modelTokenLimit?: number;
  effectiveTokenLimit?: number;
  completionTokens?: number;
  outputPreview: string;
  findings: DiagnosticFinding[];
  recommendedPrompts: string[];
  facts: DiagnosticFact[];
  signals: {
    maxTokensReached: boolean;
    repetitionDetected: boolean;
    malformedToolCall: boolean;
    toolResultError: boolean;
    interruptedResponse: boolean;
    requestRejected: boolean;
    upstreamError: boolean;
  };
}

export interface DiagnosticIssueSummary {
  severity: "warn" | "bad";
  title: string;
  summary: string;
}

export interface DiagnosticPromptDefinition {
  name: DiagnosticPromptName;
  title: string;
  description: string;
  arguments: Array<{
    name: "request_id";
    description: string;
    required: true;
  }>;
}

export interface DiagnosticPromptMessage {
  role: "system" | "user";
  text: string;
}

export interface DiagnosticPromptContextPayload {
  report: DiagnosticReport;
  request: {
    entry: RequestLogDetail["entry"];
    requestBody: JsonValue | null;
    responseBodyPreview: string;
  };
}

export type DiagnosticPromptName =
  | "diagnose-request"
  | "troubleshoot-max-tokens"
  | "troubleshoot-repetition"
  | "troubleshoot-routing";
