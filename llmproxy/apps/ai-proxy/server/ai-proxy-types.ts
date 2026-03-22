import type { H3Event } from "h3";
import type {
  AiClientConfigService,
  AiClientLoadBalancer,
  DiagnosticReport,
} from "../../ai-client/server/ai-client-capability";
import { buildHealthPayload, buildModelsPayload } from "./utils/public-route-payloads";
import type {
  ActiveConnectionKind,
  ActiveConnectionPhase,
  ConnectionConfig,
  JsonValue,
  LeaseReleaseResult,
  ProxyRouteRequest,
  ProxySnapshot,
  RequestLogDetail,
} from "../../shared/type-api";
import type { StreamingAccumulator, StreamingAccumulatorUpdate } from "./utils/streaming";

export interface ActiveConnectionRuntime {
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
  receivedAt: number;
  lastUpdatedAt: number;
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
  requestedCompletionTokenLimit?: number;
  energyUsageWh?: number;
  firstTokenAt?: number;
  finishReason?: string;
  metricsExact: boolean;
  requestBody?: JsonValue;
  responseBody?: JsonValue;
  streamingAccumulator?: StreamingAccumulator;
  cancelSource?: "client_disconnect" | "dashboard" | "timeout";
  cancel?: (message?: string) => void;
}

export interface AiProxyRequestDiagnostics {
  detail: RequestLogDetail;
  report: DiagnosticReport;
}

export interface LiveRequestState {
  start(): Promise<void>;
  stop(): Promise<void>;
  openRequestDetailSse(
    event: H3Event,
    requestId: string,
  ): Promise<{ error: { message: string; type: string } } | void>;
  openDashboardSse(
    event: H3Event,
  ): Promise<{ error: { message: string; type: string } } | void>;
  inspectActiveConnection(requestId: string): {
    responseBody?: JsonValue;
    hasStreamingPayload: boolean;
  } | undefined;
  getDashboardSseClientCount(): number;
  getSseBufferedBytes(): number;
  cancelActiveRequest(requestId: string): boolean;
  hasActiveConnection(requestId: string): boolean;
  getActiveConnection(requestId: string): ActiveConnectionRuntime | undefined;
  listActiveConnections(): ActiveConnectionRuntime[];
  setCancelHandler(requestId: string, cancel: ActiveConnectionRuntime["cancel"]): void;
  hasRequestDetailSubscribers(requestId: string): boolean;
  getSnapshot(): ProxySnapshot;
  getRequestDetail(requestId: string): RequestLogDetail | undefined;
  getDiagnosticsReport(requestId: string): AiProxyRequestDiagnostics | undefined;
  trackConnection(
    route: ProxyRouteRequest,
    kind: ActiveConnectionKind,
    upstreamStream: boolean,
  ): void;
  startConnectionEnergyTracking(
    requestId: string,
    backend: Pick<ConnectionConfig, "id" | "energyUsageUrl" | "monitoringTimeoutMs">,
  ): void;
  updateConnection(
    requestId: string,
    patch: Partial<Omit<ActiveConnectionRuntime, "id" | "receivedAt">>,
    immediate?: boolean,
  ): void;
  applyStreamingUpdate(
    requestId: string,
    update: StreamingAccumulatorUpdate,
    responseBody?: Record<string, unknown>,
  ): void;
  removeConnection(requestId: string): void;
  buildReleaseMetrics(requestId: string): Partial<LeaseReleaseResult>;
}

export interface AiProxyService {
  configService: AiClientConfigService;
  loadBalancer: AiClientLoadBalancer;
  requestState: LiveRequestState;
  buildHealthPayload: () => ReturnType<typeof buildHealthPayload>;
  buildModelsPayload: () => ReturnType<typeof buildModelsPayload>;
  isSupportedPublicPath: (pathname: string) => boolean;
  handlePublicRoute: (event: H3Event) => Promise<Record<string, unknown> | Uint8Array | Buffer | string | void>;
  stop: () => Promise<void>;
}
