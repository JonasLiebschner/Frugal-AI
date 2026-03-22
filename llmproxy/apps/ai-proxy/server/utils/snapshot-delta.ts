import type {
  ActiveConnectionSnapshot,
  BackendRuntimeSnapshot,
  ProxySnapshot,
  ProxySnapshotDelta,
  RequestLogEntry,
  SnapshotCollectionDelta,
} from "../../../shared/type-api";

type SnapshotEntity = { id: string };

function buildCollectionDelta<T extends SnapshotEntity>(
  previous: T[],
  current: T[],
): SnapshotCollectionDelta<T> | undefined {
  const previousById = new Map(previous.map((entry) => [entry.id, JSON.stringify(entry)]));
  const currentById = new Map(current.map((entry) => [entry.id, entry]));
  const upserted = current.filter((entry) => previousById.get(entry.id) !== JSON.stringify(entry));
  const removedIds = previous
    .map((entry) => entry.id)
    .filter((id) => !currentById.has(id));
  const previousOrder = previous.map((entry) => entry.id);
  const currentOrder = current.map((entry) => entry.id);
  const orderChanged = previousOrder.length !== currentOrder.length
    || previousOrder.some((id, index) => currentOrder[index] !== id);

  if (upserted.length === 0 && removedIds.length === 0 && !orderChanged) {
    return undefined;
  }

  return {
    upserted,
    ...(removedIds.length > 0 ? { removedIds } : {}),
    ...(orderChanged ? { orderedIds: currentOrder } : {}),
  };
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildProxySnapshotDelta(previous: ProxySnapshot, current: ProxySnapshot): ProxySnapshotDelta | undefined {
  const delta: ProxySnapshotDelta = {};

  if (previous.startedAt !== current.startedAt) {
    delta.startedAt = current.startedAt;
  }

  if (previous.queueDepth !== current.queueDepth) {
    delta.queueDepth = current.queueDepth;
  }

  if (previous.recentRequestLimit !== current.recentRequestLimit) {
    delta.recentRequestLimit = current.recentRequestLimit;
  }

  if (!sameJsonValue(previous.totals, current.totals)) {
    delta.totals = current.totals;
  }

  const backendsDelta = buildCollectionDelta<BackendRuntimeSnapshot>(previous.backends, current.backends);
  if (backendsDelta) {
    delta.backends = backendsDelta;
  }

  const activeConnectionsDelta = buildCollectionDelta<ActiveConnectionSnapshot>(
    previous.activeConnections,
    current.activeConnections,
  );
  if (activeConnectionsDelta) {
    delta.activeConnections = activeConnectionsDelta;
  }

  const recentRequestsDelta = buildCollectionDelta<RequestLogEntry>(previous.recentRequests, current.recentRequests);
  if (recentRequestsDelta) {
    delta.recentRequests = recentRequestsDelta;
  }

  return Object.keys(delta).length > 0 ? delta : undefined;
}
