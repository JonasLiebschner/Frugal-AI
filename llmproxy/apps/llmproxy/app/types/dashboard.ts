import type { OtelPublicConfig } from "../../../otel/otel-client";

export type EditableOtelConfig = OtelPublicConfig;

export type DashboardPage = "overview" | "logs" | "playground" | "config";
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface EditableAiClientSettings {
  requestTimeoutMs: number;
  queueTimeoutMs: number;
  healthCheckIntervalMs: number;
  recentRequestLimit: number;
}

export interface EditableAiRequestRoutingMiddleware {
  id: string;
  url: string;
  models: {
    small: string;
    large: string;
  };
}

export type ConfigSchemaDocument = Record<string, unknown>;

export interface ProxySnapshot {
  startedAt: string;
  queueDepth: number;
  recentRequestLimit: number;
  totals: {
    activeRequests: number;
    successfulRequests: number;
    failedRequests: number;
    cancelledRequests: number;
    rejectedRequests: number;
  };
  backends: BackendSnapshot[];
  activeConnections: ActiveConnectionSnapshot[];
  recentRequests: RequestLogEntry[];
}

export interface SnapshotCollectionDelta<T extends { id: string }> {
  upserted: T[];
  removedIds?: string[];
  orderedIds?: string[];
}

export interface ProxySnapshotDelta {
  startedAt?: string;
  queueDepth?: number;
  recentRequestLimit?: number;
  totals?: ProxySnapshot["totals"];
  backends?: SnapshotCollectionDelta<BackendSnapshot>;
  activeConnections?: SnapshotCollectionDelta<ActiveConnectionSnapshot>;
  recentRequests?: SnapshotCollectionDelta<RequestLogEntry>;
}

export interface BackendSnapshot {
  id: string;
  name: string;
  baseUrl: string;
  connector: "openai" | "ollama" | "llama.cpp";
  enabled: boolean;
  healthy: boolean;
  maxConcurrency: number;
  activeRequests: number;
  availableSlots: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cancelledRequests: number;
  lastLatencyMs?: number;
  avgLatencyMs?: number;
  lastCheckedAt?: string;
  lastError?: string;
  configuredModels: string[];
  discoveredModels: string[];
  discoveredModelDetails: Array<{ id: string; metadata?: JsonValue }>;
}

export interface ActiveConnectionSnapshot {
  id: string;
  kind: string;
  method: string;
  path: string;
  clientIp?: string;
  model?: string;
  routingMiddlewareId?: string;
  routingMiddlewareProfile?: string;
  clientStream: boolean;
  upstreamStream: boolean;
  phase: "queued" | "connected" | "streaming";
  startedAt: string;
  elapsedMs: number;
  queueMs: number;
  backendId?: string;
  backendName?: string;
  statusCode?: number;
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  contentTokens: number;
  reasoningTokens: number;
  textTokens: number;
  promptMs?: number;
  generationMs?: number;
  promptTokensPerSecond?: number;
  completionTokensPerSecond?: number;
  effectiveCompletionTokenLimit?: number;
  energyUsageWh?: number;
  timeToFirstTokenMs?: number;
  finishReason?: string;
  metricsExact: boolean;
  hasDetail?: boolean;
}

export interface RequestLogEntry {
  id: string;
  time: string;
  method: string;
  path: string;
  clientIp?: string;
  requestType?: "stream" | "json";
  model?: string;
  routingMiddlewareId?: string;
  routingMiddlewareProfile?: string;
  backendId?: string;
  backendName?: string;
  outcome: "success" | "error" | "cancelled" | "queued_timeout";
  latencyMs: number;
  queuedMs: number;
  statusCode?: number;
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  contentTokens?: number;
  reasoningTokens?: number;
  textTokens?: number;
  promptMs?: number;
  generationMs?: number;
  promptTokensPerSecond?: number;
  completionTokensPerSecond?: number;
  effectiveCompletionTokenLimit?: number;
  energyUsageWh?: number;
  timeToFirstTokenMs?: number;
  finishReason?: string;
  diagnosticSeverity?: "warn" | "bad";
  diagnosticTitle?: string;
  diagnosticSummary?: string;
  metricsExact?: boolean;
  hasDetail?: boolean;
}

export interface RequestLogDetail {
  entry: RequestLogEntry;
  requestBody?: JsonValue;
  responseBody?: JsonValue;
  otel?: {
    pending?: boolean;
    span?: JsonValue;
    result?: {
      outcome: "success" | "failed";
      exportedAt: string;
      statusCode?: number;
      responseBody?: JsonValue;
      error?: string;
    };
  };
  live?: boolean;
}

export interface KnownModel {
  id: string;
  ownedBy: string;
}

export interface UiBadge {
  text: string;
  tone?: "good" | "warn" | "bad" | "neutral";
  title?: string;
  className?: string;
}

export interface DebugTranscriptEntry {
  role: string;
  content?: JsonValue;
  reasoning_content?: string;
  refusal?: string;
  // Older stored transcripts may still contain this field even though tool_calls is preferred.
  function_call?: JsonValue;
  tool_calls?: JsonValue[];
  audio?: JsonValue;
  name?: string;
  tool_call_id?: string;
  model?: string;
  backend?: string;
  finish_reason?: string;
  pending?: boolean;
  pending_title?: string;
}

export interface EditableConnectionConfig {
  id: string;
  name: string;
  baseUrl: string;
  connector: "openai" | "ollama" | "llama.cpp";
  enabled: boolean;
  maxConcurrency: number;
  healthPath?: string;
  models?: string[];
  headers?: Record<string, string>;
  apiKeyEnv?: string;
  apiKeyConfigured: boolean;
  timeoutMs?: number;
  monitoringTimeoutMs?: number;
  monitoringIntervalMs?: number;
  energyUsageUrl?: string;
}

export interface BackendEditorFields {
  id: string;
  name: string;
  baseUrl: string;
  connector: "openai" | "ollama" | "llama.cpp";
  enabled: boolean;
  maxConcurrency: string;
  healthPath: string;
  modelsText: string;
  headersText: string;
  apiKey: string;
  apiKeyEnv: string;
  clearApiKey: boolean;
  timeoutMs: string;
  monitoringTimeoutMs: string;
  monitoringIntervalMs: string;
  energyUsageUrl: string;
}

export interface BackendEditorState {
  open: boolean;
  mode: "create" | "edit";
  originalId: string;
  saving: boolean;
  deleting: boolean;
  loading: boolean;
  error: string;
  fields: BackendEditorFields;
}

export interface ServerEditorFields {
  requestTimeoutMs: string;
  queueTimeoutMs: string;
  healthCheckIntervalMs: string;
  recentRequestLimit: string;
}

export interface ServerEditorState {
  open: boolean;
  saving: boolean;
  loading: boolean;
  error: string;
  notice: string;
  noticeTone: "good" | "warn" | "neutral";
  appliedImmediatelyFields: string[];
  fields: ServerEditorFields;
}

export interface OtelEditorFields {
  enabled: boolean;
  endpoint: string;
  headersText: string;
  clearHeaders: boolean;
  timeoutMs: string;
  serviceName: string;
  serviceNamespace: string;
  deploymentEnvironment: string;
  captureMessageContent: boolean;
  captureToolContent: boolean;
}

export interface OtelEditorState {
  open: boolean;
  saving: boolean;
  loading: boolean;
  error: string;
  notice: string;
  noticeTone: "good" | "warn" | "neutral";
  fields: OtelEditorFields;
}

export interface AiRequestMiddlewareEditorFields {
  id: string;
  url: string;
  smallModel: string;
  largeModel: string;
}

export interface AiRequestMiddlewareEditorState {
  open: boolean;
  mode: "create" | "edit";
  originalId: string;
  saving: boolean;
  deleting: boolean;
  loading: boolean;
  error: string;
  fields: AiRequestMiddlewareEditorFields;
}

export interface ToastItem {
  id: number;
  title: string;
  message: string;
  tone: "good" | "warn" | "bad" | "neutral";
}

export interface DebugParams {
  temperature: number;
  top_p: number;
  top_k: number;
  min_p: number;
  repeat_penalty: number;
  max_completion_tokens: number;
  tool_choice: "auto" | "required" | "none";
}

export interface DebugMetrics {
  startedAt: number;
  firstTokenAt: number;
  lastTokenAt: number;
  promptTokens: number | null;
  completionTokens: number;
  totalTokens: number | null;
  contentTokens: number;
  reasoningTokens: number;
  promptMs: number | null;
  generationMs: number | null;
  promptPerSecond: number | null;
  completionPerSecond: number | null;
  finishReason: string;
}

export interface DebugQueuedMessage {
  prompt: string;
  model: string;
  enableDiagnosticTools: boolean;
  params: DebugParams;
}

export interface DebugState {
  model: string;
  systemPrompt: string;
  prompt: string;
  defaultPromptDismissed: boolean;
  queuedMessages: DebugQueuedMessage[];
  enableDiagnosticTools: boolean;
  stream: boolean;
  sending: boolean;
  abortController: AbortController | null;
  backend: string;
  status: string;
  usage: string;
  error: string;
  lastRequestId: string;
  rawRequest: string;
  rawResponse: string;
  transcript: DebugTranscriptEntry[];
  metrics: DebugMetrics;
  params: DebugParams;
  dialogOpen: boolean;
}

export interface RequestDetailState {
  open: boolean;
  loading: boolean;
  requestId: string;
  tab: "request" | "response" | "tools" | "diagnosis" | "otel";
  error: string;
  detail: RequestLogDetail | null;
  cache: Record<string, RequestLogDetail>;
}

export interface DashboardState {
  snapshot: ProxySnapshot;
  mcpEnabled: boolean | null;
  connectionStatus: "connecting" | "connected";
  connectionText: string;
  models: KnownModel[];
  configSchemas: Record<string, ConfigSchemaDocument>;
  serverConfig: EditableAiClientSettings | null;
  otelConfig: EditableOtelConfig | null;
  aiRequestMiddlewares: EditableAiRequestRoutingMiddleware[];
  requestDetail: RequestDetailState;
  backendConfigs: Record<string, EditableConnectionConfig>;
  backendEditor: BackendEditorState;
  serverEditor: ServerEditorState;
  otelEditor: OtelEditorState;
  aiRequestMiddlewareEditor: AiRequestMiddlewareEditorState;
  debug: DebugState;
  toasts: ToastItem[];
}

export interface SummaryCard {
  key: string;
  label: string;
  value: string | number;
  note: string;
  title: string;
  tone?: "good" | "warn" | "bad" | "neutral" | "info";
  segments?: Array<{
    text: string;
    label?: string;
    tone?: "good" | "warn" | "bad" | "neutral" | "info";
    title?: string;
    separatorBefore?: string;
    drilldown?: {
      page: DashboardPage;
      hash?: string;
      query?: Record<string, string>;
    };
  }>;
}

export interface RequestFieldRow {
  key: string;
  value: string;
  title: string;
  valueBadges?: UiBadge[];
}

export interface RenderMessageOptions {
  heading?: string;
  role?: string;
  finishReason?: string;
  hideFinishBadge?: boolean;
  reasoningCollapsed?: boolean;
  extraBadges?: UiBadge[];
  hideRoleBadge?: boolean;
  hideModelBadge?: boolean;
  hideToolMetaBadges?: boolean;
}

export interface ConversationTranscriptItem {
  key: string | number;
  message: Record<string, unknown>;
  index: number;
  finishReason?: string;
  hideFinishBadge?: boolean;
  reasoningCollapsed?: boolean;
  extraBadges?: UiBadge[];
}

export interface ModelDetailField {
  label: string;
  value: string;
}

export interface ModelDetailSection {
  title: string;
  fields: ModelDetailField[];
}

export interface ModelDetailView {
  title: string;
  subtitle: string;
  summary: ModelDetailField[];
  sections: ModelDetailSection[];
  rawMetadata?: JsonValue;
}

export interface ModelSpec {
  text: string;
  className: string;
  detail?: ModelDetailView;
}

export interface DiagnosticFinding {
  code: string;
  severity: "info" | "warn" | "bad";
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

export interface McpPromptArgumentDefinition {
  name: string;
  description: string;
  required: boolean;
}

export interface McpPromptDefinition {
  name: string;
  title: string;
  description: string;
  arguments: McpPromptArgumentDefinition[];
}

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpHelperRouteDefinition {
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
}

export interface McpServiceDefinition {
  id: string;
  title: string;
  description: string;
  helperRoutes: McpHelperRouteDefinition[];
  tools: McpToolDefinition[];
  prompts: McpPromptDefinition[];
}

export interface McpManifest {
  endpoint: string;
  services: McpServiceDefinition[];
  helperRoutes: McpHelperRouteDefinition[];
  tools: McpToolDefinition[];
  prompts: McpPromptDefinition[];
}

export type DiagnosticPromptDefinition = McpPromptDefinition;
export type DiagnosticsToolDefinition = McpToolDefinition;

export interface DiagnosticPromptMessage {
  role: "system" | "user";
  content: {
    type: "text";
    text: string;
  };
}

export interface DiagnosticPromptPayload {
  name: string;
  description: string;
  messages: DiagnosticPromptMessage[];
}

export interface DiagnosticsReportPayload {
  detail: RequestLogDetail;
  report: DiagnosticReport;
}
