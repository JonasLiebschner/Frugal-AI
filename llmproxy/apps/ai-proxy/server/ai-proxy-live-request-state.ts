import { setResponseStatus, type H3Event } from "h3";
import type { AiClientLoadBalancer } from "../../ai-client/server/ai-client-capability";
import { AiProxyRequestEnergyTracker } from "./ai-proxy-request-energy";
import type { ActiveConnectionRuntime } from "./ai-proxy-types";
import { getDiagnosticsReport as buildRequestDiagnosticsReport } from "./ai-proxy-request-diagnostics";
import {
  applyStreamingUpdateToConnection,
  buildReleaseMetricsForConnection,
  createActiveConnection,
  patchActiveConnection,
} from "./ai-proxy-active-connections";
import {
  broadcastAiProxyDashboardSnapshot,
  broadcastAiProxyRequestDetail,
  createAiProxySseEvent,
  getAiProxyRequestDetailTopicId,
} from "./ai-proxy-live-request-broadcast";
import { buildLiveRequestStateSnapshot, resolveLiveRequestDetail } from "./ai-proxy-live-request-view";
import { proxyError } from "./utils/proxy-error-utils";
import type { SseCapability } from "../../sse/server/sse-capability";
import type {
  ActiveConnectionKind,
  JsonValue,
  LeaseReleaseResult,
  ProxyRouteRequest,
  ProxySnapshot,
  RequestLogDetail,
} from "../../shared/type-api";
import type { StreamingAccumulatorUpdate } from "./utils/streaming";

export interface LiveRequestStateOptions {
  sse: Pick<
    SseCapability,
    | "isEnabled"
    | "broadcastHeartbeat"
    | "getTopicClientCount"
    | "getBufferedBytes"
    | "hasSubscribers"
    | "openTopicStream"
    | "closeAll"
    | "broadcastTopic"
    | "closeTopicSubscribers"
  >;
  dashboardTopicId?: string;
  requestDetailTopicPrefix?: string;
  energy?: {
    fetcher?: typeof fetch;
    pollIntervalMs?: number;
  };
}

const DEFAULT_DASHBOARD_TOPIC_ID = "ai-proxy:dashboard";
const DEFAULT_REQUEST_DETAIL_TOPIC_PREFIX = "ai-proxy:request-detail:";

export class LiveRequestState {
  private sse: LiveRequestStateOptions["sse"];
  private readonly dashboardTopicId: string;
  private readonly requestDetailTopicPrefix: string;
  private readonly activeConnections = new Map<string, ActiveConnectionRuntime>();
  private readonly requestEnergy: AiProxyRequestEnergyTracker;
  private latestDashboardSnapshot?: ProxySnapshot;
  private heartbeat?: NodeJS.Timeout;
  private liveSnapshotTicker?: NodeJS.Timeout;
  private snapshotTimer?: NodeJS.Timeout;
  private started = false;

  public constructor(
    private readonly loadBalancer: AiClientLoadBalancer,
    options: LiveRequestStateOptions,
  ) {
    this.sse = options.sse;
    this.dashboardTopicId = options.dashboardTopicId ?? DEFAULT_DASHBOARD_TOPIC_ID;
    this.requestDetailTopicPrefix = options.requestDetailTopicPrefix ?? DEFAULT_REQUEST_DETAIL_TOPIC_PREFIX;
    this.requestEnergy = new AiProxyRequestEnergyTracker({
      fetcher: options.energy?.fetcher,
      pollIntervalMs: options.energy?.pollIntervalMs,
      updateRequestEnergy: (requestId, energyUsageWh) => {
        this.updateConnection(requestId, { energyUsageWh });
      },
    });
  }

  public setSse(sse: LiveRequestStateOptions["sse"]): void {
    this.sse = sse;
  }

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    this.loadBalancer.on("snapshot", this.handleLoadBalancerSnapshot);
    this.loadBalancer.on("request_detail", this.handleRequestDetailUpdated);
    this.heartbeat = setInterval(() => {
      this.sse.broadcastHeartbeat({
        event: "ping",
        data: "",
      });
    }, 15_000);
    this.liveSnapshotTicker = setInterval(() => {
      if (this.activeConnections.size === 0 || this.sse.getTopicClientCount(this.dashboardTopicId) === 0) {
        return;
      }

      this.broadcastCurrentSnapshot();
    }, 1_000);
  }

  public async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.loadBalancer.off("snapshot", this.handleLoadBalancerSnapshot);
    this.loadBalancer.off("request_detail", this.handleRequestDetailUpdated);

    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }

    if (this.liveSnapshotTicker) {
      clearInterval(this.liveSnapshotTicker);
      this.liveSnapshotTicker = undefined;
    }

    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = undefined;
    }

    await this.requestEnergy.stop();
    await this.sse.closeAll();
  }

  public async openRequestDetailSse(
    event: H3Event,
    requestId: string,
  ): Promise<{ error: { message: string; type: string } } | void> {
    if (!requestId) {
      setResponseStatus(event, 404);
      return proxyError("Request detail live feed was not found.");
    }

    const detail = this.getRequestDetail(requestId);
    if (!detail) {
      setResponseStatus(event, 404);
      return proxyError(`Recent request "${requestId}" was not found.`);
    }

    await this.sse.openTopicStream(
      event,
      getAiProxyRequestDetailTopicId(this.requestDetailTopicPrefix, requestId),
      createAiProxySseEvent("request_detail", detail),
      { keepOpen: detail.live === true || detail.otel?.pending === true },
    );
  }

  public async openDashboardSse(
    event: H3Event,
  ): Promise<{ error: { message: string; type: string } } | void> {
    const snapshot = this.getSnapshot();
    this.latestDashboardSnapshot = snapshot;
    await this.sse.openTopicStream(
      event,
      this.dashboardTopicId,
      createAiProxySseEvent("snapshot", snapshot),
    );
  }

  public inspectActiveConnection(requestId: string): {
    responseBody?: JsonValue;
    hasStreamingPayload: boolean;
  } | undefined {
    const connection = this.activeConnections.get(requestId);
    if (!connection) {
      return undefined;
    }

    return {
      responseBody: connection.responseBody,
      hasStreamingPayload: connection.streamingAccumulator?.hasPayload === true,
    };
  }

  public getDashboardSseClientCount(): number {
    return this.sse.getTopicClientCount(this.dashboardTopicId);
  }

  public getSseBufferedBytes(): number {
    return this.sse.getBufferedBytes();
  }

  public cancelActiveRequest(requestId: string): boolean {
    const connection = this.activeConnections.get(requestId);
    if (!connection?.cancel) {
      return false;
    }

    connection.cancel("Request cancelled from dashboard.");
    return true;
  }

  public hasActiveConnection(requestId: string): boolean {
    return this.activeConnections.has(requestId);
  }

  public getActiveConnection(requestId: string): ActiveConnectionRuntime | undefined {
    return this.activeConnections.get(requestId);
  }

  public listActiveConnections(): ActiveConnectionRuntime[] {
    return Array.from(this.activeConnections.values());
  }

  public setCancelHandler(requestId: string, cancel: ActiveConnectionRuntime["cancel"]): void {
    const connection = this.activeConnections.get(requestId);
    if (!connection) {
      return;
    }

    connection.cancel = cancel;
  }

  public hasRequestDetailSubscribers(requestId: string): boolean {
    return this.sse.hasSubscribers(getAiProxyRequestDetailTopicId(this.requestDetailTopicPrefix, requestId));
  }

  public getSnapshot(): ProxySnapshot {
    return buildLiveRequestStateSnapshot({
      loadBalancerSnapshot: this.loadBalancer.getSnapshot(),
      activeConnections: this.activeConnections.values(),
    });
  }

  public getRequestDetail(requestId: string): RequestLogDetail | undefined {
    const loadBalancerSnapshot = this.loadBalancer.getSnapshot();
    return resolveLiveRequestDetail({
      requestId,
      activeConnections: this.activeConnections,
      backendSnapshots: loadBalancerSnapshot.backends,
      resolveHistoricalDetail: (id) => this.loadBalancer.getRequestLogDetail(id),
    });
  }

  public getDiagnosticsReport(requestId: string): ReturnType<typeof buildRequestDiagnosticsReport> {
    return buildRequestDiagnosticsReport(this, requestId);
  }

  public trackConnection(
    route: ProxyRouteRequest,
    kind: ActiveConnectionKind,
    upstreamStream: boolean,
  ): void {
    this.activeConnections.set(route.id, createActiveConnection(route, kind, upstreamStream));
    this.broadcastRequestDetail(route.id);
    this.broadcastCurrentSnapshot();
  }

  public startConnectionEnergyTracking(
    requestId: string,
    backend: Parameters<AiProxyRequestEnergyTracker["startTracking"]>[1],
  ): void {
    this.requestEnergy.startTracking(requestId, backend);
  }

  public updateConnection(
    requestId: string,
    patch: Partial<Omit<ActiveConnectionRuntime, "id" | "receivedAt">>,
    immediate = false,
  ): void {
    const connection = this.activeConnections.get(requestId);
    if (!connection) {
      return;
    }

    patchActiveConnection(connection, patch);
    this.broadcastRequestDetail(requestId);

    if (immediate) {
      this.broadcastCurrentSnapshot();
      return;
    }

    this.scheduleSnapshotBroadcast();
  }

  public applyStreamingUpdate(
    requestId: string,
    update: StreamingAccumulatorUpdate,
    responseBody?: Record<string, unknown>,
  ): void {
    const connection = this.activeConnections.get(requestId);
    if (!connection) {
      return;
    }

    applyStreamingUpdateToConnection(connection, update, responseBody);
    this.broadcastRequestDetail(requestId);
    this.scheduleSnapshotBroadcast();
  }

  public removeConnection(requestId: string): void {
    this.requestEnergy.dropRequest(requestId);
    if (!this.activeConnections.delete(requestId)) {
      return;
    }

    this.broadcastRequestDetail(requestId);
    this.broadcastCurrentSnapshot();
  }

  public buildReleaseMetrics(requestId: string): Partial<LeaseReleaseResult> {
    const connection = this.activeConnections.get(requestId);
    const energyUsageWh = this.requestEnergy.finalizeRequest(requestId);
    if (connection && typeof energyUsageWh === "number") {
      connection.energyUsageWh = energyUsageWh;
    }

    return {
      ...buildReleaseMetricsForConnection(
        connection,
        this.loadBalancer.getSnapshot().backends,
      ),
      ...(typeof energyUsageWh === "number" ? { energyUsageWh } : {}),
    };
  }

  private scheduleSnapshotBroadcast(): void {
    if (this.snapshotTimer) {
      return;
    }

    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = undefined;
      this.broadcastCurrentSnapshot();
    }, 150);
  }

  private broadcastCurrentSnapshot(): void {
    this.latestDashboardSnapshot = broadcastAiProxyDashboardSnapshot({
      sse: this.sse,
      dashboardTopicId: this.dashboardTopicId,
      latestDashboardSnapshot: this.latestDashboardSnapshot,
      getSnapshot: () => this.getSnapshot(),
    });
  }

  private broadcastRequestDetail(requestId: string): void {
    broadcastAiProxyRequestDetail({
      sse: this.sse,
      requestDetailTopicPrefix: this.requestDetailTopicPrefix,
      requestId,
      getRequestDetail: (id) => this.getRequestDetail(id),
    });
  }

  private readonly handleLoadBalancerSnapshot = (): void => {
    this.scheduleSnapshotBroadcast();
  };

  private readonly handleRequestDetailUpdated = (requestId: string): void => {
    this.broadcastRequestDetail(requestId);
  };
}
