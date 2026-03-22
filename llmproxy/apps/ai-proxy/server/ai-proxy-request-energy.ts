import type { ConnectionConfig } from "../../shared/type-api";

const DEFAULT_REQUEST_ENERGY_POLL_INTERVAL_MS = 1_000;
const DEFAULT_REQUEST_ENERGY_TIMEOUT_MS = 5_000;

interface RequestEnergyRuntime {
  requestId: string;
  backendId: string;
  energyUsageWh: number;
  hasMeasurement: boolean;
}

interface BackendEnergyRuntime {
  backendId: string;
  url: string;
  timeoutMs: number;
  requestIds: Set<string>;
  lastSampleAt?: number;
  lastPowerW?: number;
  timer?: NodeJS.Timeout;
  inFlight?: Promise<void>;
}

export interface AiProxyRequestEnergyTrackerOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  pollIntervalMs?: number;
  updateRequestEnergy: (requestId: string, energyUsageWh: number) => void;
}

export class AiProxyRequestEnergyTracker {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly pollIntervalMs: number;
  private readonly updateRequestEnergy: (requestId: string, energyUsageWh: number) => void;
  private readonly backendRuntimes = new Map<string, BackendEnergyRuntime>();
  private readonly requestRuntimes = new Map<string, RequestEnergyRuntime>();

  public constructor(options: AiProxyRequestEnergyTrackerOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_REQUEST_ENERGY_POLL_INTERVAL_MS;
    this.updateRequestEnergy = options.updateRequestEnergy;
  }

  public startTracking(
    requestId: string,
    backend: Pick<ConnectionConfig, "id" | "energyUsageUrl" | "monitoringTimeoutMs">,
  ): void {
    const url = backend.energyUsageUrl?.trim();
    if (!url) {
      return;
    }

    const runtime = this.ensureBackendRuntime(backend.id, url, backend.monitoringTimeoutMs);
    const now = this.now();
    this.settleBackendEnergy(runtime, now);
    runtime.requestIds.add(requestId);
    runtime.lastSampleAt ??= now;
    this.requestRuntimes.set(requestId, {
      requestId,
      backendId: backend.id,
      energyUsageWh: 0,
      hasMeasurement: false,
    });
    this.ensurePolling(runtime);
    void this.pollBackend(runtime);
  }

  public finalizeRequest(requestId: string): number | undefined {
    return this.removeTrackedRequest(requestId, true);
  }

  public dropRequest(requestId: string): void {
    void this.removeTrackedRequest(requestId, false);
  }

  public async stop(): Promise<void> {
    const inflight = Array.from(this.backendRuntimes.values())
      .map((runtime) => runtime.inFlight)
      .filter((promise): promise is Promise<void> => Boolean(promise));

    for (const runtime of this.backendRuntimes.values()) {
      if (runtime.timer) {
        clearInterval(runtime.timer);
        runtime.timer = undefined;
      }
    }

    this.backendRuntimes.clear();
    this.requestRuntimes.clear();
    await Promise.allSettled(inflight);
  }

  private ensureBackendRuntime(
    backendId: string,
    url: string,
    monitoringTimeoutMs?: number,
  ): BackendEnergyRuntime {
    const existing = this.backendRuntimes.get(backendId);
    const timeoutMs = monitoringTimeoutMs ?? DEFAULT_REQUEST_ENERGY_TIMEOUT_MS;

    if (existing) {
      existing.url = url;
      existing.timeoutMs = timeoutMs;
      return existing;
    }

    const runtime: BackendEnergyRuntime = {
      backendId,
      url,
      timeoutMs,
      requestIds: new Set<string>(),
    };
    this.backendRuntimes.set(backendId, runtime);
    return runtime;
  }

  private ensurePolling(runtime: BackendEnergyRuntime): void {
    if (runtime.timer) {
      return;
    }

    runtime.timer = setInterval(() => {
      void this.pollBackend(runtime);
    }, this.pollIntervalMs);
  }

  private async pollBackend(runtime: BackendEnergyRuntime): Promise<void> {
    if (runtime.inFlight || runtime.requestIds.size === 0) {
      return;
    }

    const promise = this.sampleBackend(runtime).finally(() => {
      if (runtime.inFlight === promise) {
        runtime.inFlight = undefined;
      }
    });

    runtime.inFlight = promise;
    await promise;
  }

  private async sampleBackend(runtime: BackendEnergyRuntime): Promise<void> {
    const startedAt = this.now();
    let response: Response;

    try {
      response = await fetchWithTimeout(
        this.fetcher,
        runtime.url,
        {
          method: "GET",
          headers: {
            accept: "application/json",
          },
        },
        runtime.timeoutMs,
      );
    } catch {
      return;
    }

    if (!response.ok) {
      return;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return;
    }

    const totalPowerW = parseTotalPowerW(payload);
    if (totalPowerW === undefined) {
      return;
    }

    const finishedAt = this.now();
    this.markRequestsMeasured(runtime);
    this.settleBackendEnergy(runtime, Math.max(startedAt, finishedAt), totalPowerW);
    runtime.lastPowerW = totalPowerW;
    runtime.lastSampleAt = Math.max(startedAt, finishedAt);
  }

  private settleBackendEnergy(
    runtime: BackendEnergyRuntime,
    now: number,
    fallbackPowerW?: number,
  ): void {
    const powerW = runtime.lastPowerW ?? fallbackPowerW;
    if (runtime.lastSampleAt === undefined) {
      runtime.lastSampleAt = now;
      return;
    }

    const deltaMs = Math.max(0, now - runtime.lastSampleAt);
    runtime.lastSampleAt = now;

    if (deltaMs <= 0 || runtime.requestIds.size === 0 || powerW === undefined || !Number.isFinite(powerW) || powerW < 0) {
      return;
    }

    const perRequestWh = (powerW * deltaMs) / 3_600_000 / runtime.requestIds.size;
    if (!Number.isFinite(perRequestWh) || perRequestWh <= 0) {
      return;
    }

    for (const requestId of runtime.requestIds) {
      const requestRuntime = this.requestRuntimes.get(requestId);
      if (!requestRuntime) {
        continue;
      }

      requestRuntime.energyUsageWh = normalizeEnergyUsageWh(requestRuntime.energyUsageWh + perRequestWh);
      this.updateRequestEnergy(requestId, requestRuntime.energyUsageWh);
    }
  }

  private markRequestsMeasured(runtime: BackendEnergyRuntime): void {
    for (const requestId of runtime.requestIds) {
      const requestRuntime = this.requestRuntimes.get(requestId);
      if (requestRuntime) {
        requestRuntime.hasMeasurement = true;
      }
    }
  }

  private removeTrackedRequest(requestId: string, finalize: boolean): number | undefined {
    const requestRuntime = this.requestRuntimes.get(requestId);
    if (!requestRuntime) {
      return undefined;
    }

    const backendRuntime = this.backendRuntimes.get(requestRuntime.backendId);
    if (backendRuntime) {
      this.settleBackendEnergy(backendRuntime, this.now());
      backendRuntime.requestIds.delete(requestId);

      if (backendRuntime.requestIds.size === 0) {
        if (backendRuntime.timer) {
          clearInterval(backendRuntime.timer);
          backendRuntime.timer = undefined;
        }
        this.backendRuntimes.delete(backendRuntime.backendId);
      }
    }

    this.requestRuntimes.delete(requestId);
    if (!finalize || !requestRuntime.hasMeasurement) {
      return undefined;
    }

    return normalizeEnergyUsageWh(requestRuntime.energyUsageWh);
  }
}

function normalizeEnergyUsageWh(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function parseTotalPowerW(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const totalPowerW = (payload as Record<string, unknown>).total_power_w;
  return typeof totalPowerW === "number" && Number.isFinite(totalPowerW) && totalPowerW >= 0
    ? totalPowerW
    : undefined;
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Timed out after ${timeoutMs}ms.`));
  }, timeoutMs);

  try {
    return await fetcher(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
