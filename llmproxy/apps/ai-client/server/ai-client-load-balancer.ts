import { EventEmitter } from "node:events";
import {
  AiClientConfig,
  AiClientSettings,
  BackendLease,
  KnownModel,
  LeaseReleaseResult,
  ProxyRouteRequest,
  ProxySnapshot,
  RequestLogDetail,
  RequestLogEntry,
  RequestOtelDebug,
} from "../../shared/type-api";
import {
  markAiClientBackendUnhealthy,
  markAllAiClientBackendsDue,
  replaceAiClientBackendRuntimes,
  resolveAiClientBackendRuntime,
  type AiClientBackendRuntime,
} from "./ai-client-backend-runtime";
import {
  buildRejectedRequestLogEntry,
} from "./ai-client-lease-outcome";
import {
  getNextAiClientBackendHealthDelay,
  listDueAiClientBackendIds,
  refreshAiClientBackendHealth,
} from "./ai-client-health-refresh";
import { tryAcquireAiClientLease } from "./ai-client-lease";
import { applyAiRequestRoutingMiddleware } from "./ai-client-middleware-routing";
import {
  drainPendingAcquireQueue,
  enqueuePendingAcquire,
  type PendingAcquireRequest,
  rejectAllPendingAcquires,
} from "./ai-client-queue";
import { AiClientRequestLogStore } from "./ai-client-request-log";
import { getAiClientRoutingAvailabilityError } from "./ai-client-routing-availability";
import { buildAiClientSnapshot, listAiClientKnownModels } from "./ai-client-snapshot";
import { type AiRequestMiddlewareRegistry } from "../../ai-request-middleware/server/ai-request-middleware-capability";

interface LoadBalancerOptions {
  fetcher?: typeof fetch;
  requestLogWriter?: (line: string) => void;
  requestLogObserver?: (
    detail: RequestLogDetail,
    connection?: AiClientConfig["connections"][number],
  ) => void;
  requestMiddleware?: AiRequestMiddlewareRegistry;
  random?: () => number;
}

export class LoadBalancer extends EventEmitter {
  private readonly fetcher: typeof fetch;
  private readonly requestLog: AiClientRequestLogStore;
  private readonly requestMiddleware?: AiRequestMiddlewareRegistry;
  private readonly random: () => number;
  private readonly startedAt = new Date().toISOString();
  private config: AiClientConfig;
  private backends: AiClientBackendRuntime[] = [];
  private queue: PendingAcquireRequest[] = [];
  private rejectedRequests = 0;
  private nextIndex = 0;
  private healthTimer?: NodeJS.Timeout;
  private healthAbortController?: AbortController;
  private healthRefreshPromise?: Promise<void>;
  private stopped = false;
  private healthLoopActive = false;

  public constructor(config: AiClientConfig, options: LoadBalancerOptions = {}) {
    super();
    this.fetcher = options.fetcher ?? fetch;
    this.requestMiddleware = options.requestMiddleware;
    this.random = options.random ?? Math.random;
    this.config = config;
    this.requestLog = new AiClientRequestLogStore({
      getRecentRequestLimit: () => this.config.recentRequestLimit,
      getSnapshot: () => this.getSnapshot(),
      resolveConnection: (backendId) =>
        this.backends.find((backend) => backend.config.id === backendId)?.config,
      requestLogWriter: options.requestLogWriter,
      requestLogObserver: options.requestLogObserver,
      onDetailUpdated: (requestId) => {
        this.emitRequestDetail(requestId);
      },
    });
    this.replaceConfig(config);
  }

  public getAiClientSettings(): AiClientSettings {
    return {
      requestTimeoutMs: this.config.requestTimeoutMs,
      queueTimeoutMs: this.config.queueTimeoutMs,
      healthCheckIntervalMs: this.config.healthCheckIntervalMs,
      recentRequestLimit: this.config.recentRequestLimit,
    };
  }

  public getSnapshot(): ProxySnapshot {
    return buildAiClientSnapshot({
      startedAt: this.startedAt,
      queueDepth: this.queue.length,
      recentRequestLimit: this.config.recentRequestLimit,
      rejectedRequests: this.rejectedRequests,
      backends: this.backends,
      recentRequests: this.requestLog.listEntries(),
    });
  }

  public listKnownModels(): KnownModel[] {
    return listAiClientKnownModels(this.backends);
  }

  public getRequestLogDetail(id: string): RequestLogDetail | undefined {
    return this.requestLog.getDetail(id);
  }

  public getRetainedRequestDetailBodies(id: string): Omit<RequestLogDetail, "entry"> | undefined {
    return this.requestLog.getRetainedDetailBodies(id);
  }

  public getRetainedRequestDetailCount(): number {
    return this.requestLog.getRetainedDetailCount();
  }

  public getDiagnosedRequestCount(): number {
    return this.requestLog.getDiagnosedRequestCount();
  }

  public replaceConfig(nextConfig: AiClientConfig): void {
    this.config = nextConfig;
    this.backends = replaceAiClientBackendRuntimes(this.backends, nextConfig);

    this.emitSnapshot();
    this.requestLog.trimToLimit();
    if (this.stopped) {
      return;
    }

    this.clearScheduledHealthRefresh();
    markAllAiClientBackendsDue(this.backends);
    void this.refreshHealth();
  }

  public mergeRequestOtelDebug(
    requestId: string,
    otel: RequestOtelDebug,
  ): void {
    this.requestLog.mergeOtelDebug(requestId, otel);
  }

  public async start(): Promise<void> {
    if (this.healthLoopActive) {
      return;
    }

    this.stopped = false;
    this.healthLoopActive = true;
    markAllAiClientBackendsDue(this.backends);
    await this.refreshHealth();
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    this.healthLoopActive = false;
    this.clearScheduledHealthRefresh();

    if (rejectAllPendingAcquires(this.queue, "Load balancer stopped.")) {
      this.emitSnapshot();
    }

    if (this.healthAbortController && !this.healthAbortController.signal.aborted) {
      this.healthAbortController.abort(new Error("Load balancer stopped."));
    }

    try {
      await this.healthRefreshPromise;
    } catch {
      // Ignore aborted refreshes during shutdown.
    }
  }

  public async acquire(route: ProxyRouteRequest, signal?: AbortSignal): Promise<BackendLease> {
    const effectiveRoute = await applyAiRequestRoutingMiddleware(route, {
      requestMiddleware: this.requestMiddleware,
      knownModels: this.listKnownModels(),
      signal,
      validateRoutedModel: (model) => getAiClientRoutingAvailabilityError(this.backends, model),
    });

    if (this.stopped) {
      throw new Error("Load balancer stopped.");
    }

    const routingError = getAiClientRoutingAvailabilityError(this.backends, effectiveRoute.model);
    if (routingError) {
      this.recordRejectedRequest(effectiveRoute, routingError);
      throw new Error(routingError);
    }

    const immediate = this.tryAcquire(effectiveRoute);
    if (immediate) {
      return immediate;
    }

    return enqueuePendingAcquire({
      queue: this.queue,
      route: effectiveRoute,
      queueTimeoutMs: this.config.queueTimeoutMs,
      signal,
      onRejected: (route, error, outcome, queuedMs) => {
        this.recordRejectedRequest(route, error, outcome, queuedMs);
      },
      onQueueChanged: () => {
        this.emitSnapshot();
      },
    });
  }

  public markBackendUnhealthy(id: string, error: string): void {
    if (!markAiClientBackendUnhealthy(this.backends, id, error)) {
      return;
    }
    this.emitSnapshot();
  }

  private tryAcquire(route: ProxyRouteRequest): BackendLease | undefined {
    const acquisition = tryAcquireAiClientLease({
      backends: this.backends,
      route,
      nextIndex: this.nextIndex,
      random: this.random,
      requestLog: this.requestLog,
      resolveRuntime: (id, fallback) => resolveAiClientBackendRuntime(this.backends, id, fallback),
      emitSnapshot: () => {
        this.emitSnapshot();
      },
      pumpQueue: () => {
        this.pumpQueue();
      },
    });
    this.nextIndex = acquisition.nextIndex;
    if (!acquisition.lease) {
      return undefined;
    }

    return acquisition.lease;
  }

  private pumpQueue(): void {
    drainPendingAcquireQueue(this.queue, (route) => this.tryAcquire(route));
  }

  private async refreshHealth(): Promise<void> {
    if (this.stopped) {
      return;
    }

    if (this.healthRefreshPromise) {
      return this.healthRefreshPromise;
    }

    const dueBackendIds = listDueAiClientBackendIds(this.backends);

    if (dueBackendIds.length === 0) {
      this.scheduleNextHealthRefresh();
      return;
    }

    const refreshController = new AbortController();
    this.healthAbortController = refreshController;
    this.healthRefreshPromise = (async () => {
      try {
        await Promise.all(
          dueBackendIds.map(async (backendId) => {
            if (this.stopped || refreshController.signal.aborted) {
              return;
            }

            await refreshAiClientBackendHealth({
              fetcher: this.fetcher,
              backends: this.backends,
              backendId,
              healthCheckIntervalMs: this.config.healthCheckIntervalMs,
              signal: refreshController.signal,
            });
          }),
        );

        if (this.stopped || refreshController.signal.aborted) {
          return;
        }

        this.emitSnapshot();
        this.pumpQueue();
      } finally {
        if (this.healthAbortController === refreshController) {
          this.healthAbortController = undefined;
        }
        this.healthRefreshPromise = undefined;
        this.scheduleNextHealthRefresh();
      }
    })();

    return this.healthRefreshPromise;
  }

  private emitSnapshot(): void {
    this.emit("snapshot", this.getSnapshot());
  }

  private emitRequestDetail(requestId: string): void {
    this.emit("request_detail", requestId);
  }

  private clearScheduledHealthRefresh(): void {
    if (this.healthTimer) {
      clearTimeout(this.healthTimer);
      this.healthTimer = undefined;
    }
  }

  private scheduleNextHealthRefresh(): void {
    if (this.stopped || !this.healthLoopActive || this.healthRefreshPromise) {
      return;
    }

    this.clearScheduledHealthRefresh();

    const delayMs = getNextAiClientBackendHealthDelay(this.backends);
    if (delayMs === undefined) {
      return;
    }

    this.healthTimer = setTimeout(() => {
      this.healthTimer = undefined;
      void this.refreshHealth();
    }, delayMs);
  }

  private recordRejectedRequest(
    route: ProxyRouteRequest,
    error: string,
    outcome: RequestLogEntry["outcome"] = "error",
    queuedMs = 0,
  ): void {
    this.rejectedRequests += 1;
    const entry = buildRejectedRequestLogEntry(route, error, outcome, queuedMs);
    this.requestLog.record(entry, route.requestBody, undefined);
  }
}
