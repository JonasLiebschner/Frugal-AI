import { BackendLease, ProxyRouteRequest, RequestOutcome } from "../../shared/type-api";

export interface PendingAcquireRequest {
  route: ProxyRouteRequest;
  enqueuedAt: number;
  resolve: (lease: BackendLease) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  abortCleanup?: () => void;
}

interface EnqueuePendingAcquireOptions {
  queue: PendingAcquireRequest[];
  route: ProxyRouteRequest;
  queueTimeoutMs: number;
  signal?: AbortSignal;
  onRejected: (
    route: ProxyRouteRequest,
    error: string,
    outcome: Extract<RequestOutcome, "queued_timeout" | "cancelled">,
    queuedMs: number,
  ) => void;
  onQueueChanged: () => void;
}

export function enqueuePendingAcquire({
  queue,
  route,
  queueTimeoutMs,
  signal,
  onRejected,
  onQueueChanged,
}: EnqueuePendingAcquireOptions): Promise<BackendLease> {
  return new Promise<BackendLease>((resolve, reject) => {
    const pending: PendingAcquireRequest = {
      route,
      enqueuedAt: Date.now(),
      resolve,
      reject,
      timeout: setTimeout(() => {
        removePendingAcquire(queue, pending);
        const waitedMs = Date.now() - pending.enqueuedAt;
        const message = `Timed out after ${waitedMs}ms waiting for a free backend slot.`;
        onRejected(route, message, "queued_timeout", waitedMs);
        reject(new Error(message));
        onQueueChanged();
      }, queueTimeoutMs),
    };

    if (signal) {
      const onAbort = () => {
        removePendingAcquire(queue, pending);
        const message = signal.reason instanceof Error ? signal.reason.message : "Request was aborted while queued.";
        onRejected(route, message, "cancelled", Date.now() - pending.enqueuedAt);
        reject(new Error(message));
        onQueueChanged();
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener("abort", onAbort, { once: true });
      pending.abortCleanup = () => signal.removeEventListener("abort", onAbort);
    }

    queue.push(pending);
    onQueueChanged();
  });
}

export function rejectAllPendingAcquires(queue: PendingAcquireRequest[], message: string): boolean {
  if (queue.length === 0) {
    return false;
  }

  const pendingRequests = queue.splice(0);
  for (const pending of pendingRequests) {
    cleanupPendingAcquire(pending);
    pending.reject(new Error(message));
  }

  return true;
}

export function drainPendingAcquireQueue(
  queue: PendingAcquireRequest[],
  tryAcquire: (route: ProxyRouteRequest) => BackendLease | undefined,
): void {
  let progressed = true;

  while (progressed) {
    progressed = false;

    for (let index = 0; index < queue.length; index += 1) {
      const pending = queue[index];
      const lease = tryAcquire(pending.route);

      if (!lease) {
        continue;
      }

      queue.splice(index, 1);
      cleanupPendingAcquire(pending);
      pending.resolve(lease);
      progressed = true;
      break;
    }
  }
}

export function removePendingAcquire(
  queue: PendingAcquireRequest[],
  pending: PendingAcquireRequest,
): void {
  const index = queue.indexOf(pending);

  if (index >= 0) {
    queue.splice(index, 1);
  }

  cleanupPendingAcquire(pending);
}

function cleanupPendingAcquire(pending: PendingAcquireRequest): void {
  pending.abortCleanup?.();
  clearTimeout(pending.timeout);
}
