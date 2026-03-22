export type RequestOutcome = "success" | "error" | "cancelled" | "queued_timeout";
export type ActiveConnectionPhase = "queued" | "connected" | "streaming";
export type ActiveConnectionKind = "chat.completions" | "completions" | "other";
export type BackendConnector = "openai" | "ollama" | "llama.cpp";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface AiClientSettings {
  requestTimeoutMs: number;
  queueTimeoutMs: number;
  healthCheckIntervalMs: number;
  recentRequestLimit: number;
}

export interface ConnectionConfig {
  id: string;
  name: string;
  baseUrl: string;
  connector?: BackendConnector;
  enabled: boolean;
  maxConcurrency: number;
  healthPath?: string;
  models?: string[];
  headers?: Record<string, string>;
  apiKey?: string;
  apiKeyEnv?: string;
  timeoutMs?: number;
  monitoringTimeoutMs?: number;
  monitoringIntervalMs?: number;
  energyUsageUrl?: string;
}

export interface ConnectionEditorConfig {
  id: string;
  name: string;
  baseUrl: string;
  connector: BackendConnector;
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

export interface ExternalMcpServerConfig {
  id: string;
  title: string;
  endpoint: string;
  description?: string;
  transport?: "streamable-http";
  protocolVersion?: string;
  headers?: Record<string, string>;
}

export interface ExternalMcpServerEditorConfig extends ExternalMcpServerConfig {}

export interface AiClientEditorConfig {
  requestTimeoutMs: number;
  queueTimeoutMs: number;
  healthCheckIntervalMs: number;
  recentRequestLimit: number;
  connections: ConnectionEditorConfig[];
}

export interface ConnectionSavePayload {
  id: string;
  name: string;
  baseUrl: string;
  connector?: BackendConnector;
  enabled: boolean;
  maxConcurrency: number;
  healthPath?: string;
  models?: string[];
  headers?: Record<string, string>;
  apiKey?: string;
  apiKeyEnv?: string;
  clearApiKey?: boolean;
  timeoutMs?: number;
  monitoringTimeoutMs?: number;
  monitoringIntervalMs?: number;
  energyUsageUrl?: string;
}

export interface McpClientServerSavePayload {
  id: string;
  title: string;
  endpoint: string;
  description?: string;
  transport?: "streamable-http";
  protocolVersion?: string;
  headers?: Record<string, string>;
}

export type ConnectionPatch = Partial<Pick<ConnectionConfig, "enabled" | "maxConcurrency">>;

export interface AiClientConfig {
  requestTimeoutMs: number;
  queueTimeoutMs: number;
  healthCheckIntervalMs: number;
  recentRequestLimit: number;
  connections: ConnectionConfig[];
}

export interface ProxyRouteRequest {
  id: string;
  receivedAt: number;
  method: string;
  path: string;
  requestedModel?: string;
  model?: string;
  routingMiddlewareId?: string;
  routingMiddlewareProfile?: string;
  stream: boolean;
  contentType?: string;
  clientIp?: string;
  requestBody?: JsonValue;
}

export interface LeaseReleaseResult {
  outcome: RequestOutcome;
  latencyMs: number;
  statusCode?: number;
  error?: string;
  queuedMs: number;
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
  timeToFirstTokenMs?: number;
  finishReason?: string;
  metricsExact?: boolean;
  responseBody?: JsonValue;
  energyUsageWh?: number;
}

export interface BackendLease {
  requestId: string;
  queueMs: number;
  backend: ConnectionConfig;
  selectedModel?: string;
  routingMiddlewareId?: string;
  routingMiddlewareProfile?: string;
  resolvedHeaders: Record<string, string>;
  release: (result: LeaseReleaseResult) => void;
}

export interface BackendRuntimeSnapshot {
  id: string;
  name: string;
  baseUrl: string;
  connector: BackendConnector;
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
  discoveredModelDetails: DiscoveredModelDetail[];
}

export interface DiscoveredModelDetail {
  id: string;
  metadata?: JsonValue;
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
  outcome: RequestOutcome;
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

export interface RequestOtelExportResult {
  outcome: "success" | "failed";
  exportedAt: string;
  statusCode?: number;
  responseBody?: JsonValue;
  error?: string;
}

export interface RequestOtelDebug {
  pending?: boolean;
  span?: JsonValue;
  result?: RequestOtelExportResult;
}

export interface RequestLogDetail {
  entry: RequestLogEntry;
  requestBody?: JsonValue;
  responseBody?: JsonValue;
  otel?: RequestOtelDebug;
  live?: boolean;
}

export interface ActiveConnectionSnapshot {
  id: string;
  kind: ActiveConnectionKind;
  method: string;
  path: string;
  clientIp?: string;
  model?: string;
  routingMiddlewareId?: string;
  routingMiddlewareProfile?: string;
  clientStream: boolean;
  upstreamStream: boolean;
  phase: ActiveConnectionPhase;
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

export interface KnownModel {
  id: string;
  backendId: string;
  ownedBy: string;
  source: "configured" | "discovered";
}

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
  backends: BackendRuntimeSnapshot[];
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
  backends?: SnapshotCollectionDelta<BackendRuntimeSnapshot>;
  activeConnections?: SnapshotCollectionDelta<ActiveConnectionSnapshot>;
  recentRequests?: SnapshotCollectionDelta<RequestLogEntry>;
}
