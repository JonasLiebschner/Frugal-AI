import type { ProxySnapshot, ProxySnapshotDelta, SnapshotCollectionDelta } from "../types/dashboard";

type SnapshotEntity = { id: string };

function applyCollectionDelta<T extends SnapshotEntity>(
  current: T[],
  delta?: SnapshotCollectionDelta<T>,
): T[] {
  if (!delta) {
    return current;
  }

  const removedIds = new Set(delta.removedIds ?? []);
  const currentById = new Map<string, T>();
  for (const entry of current) {
    if (!removedIds.has(entry.id)) {
      currentById.set(entry.id, entry);
    }
  }

  for (const entry of delta.upserted) {
    currentById.set(entry.id, entry);
  }

  if (delta.orderedIds) {
    const ordered: T[] = [];
    const seenIds = new Set<string>();

    for (const id of delta.orderedIds) {
      const entry = currentById.get(id);
      if (!entry) {
        continue;
      }

      ordered.push(entry);
      seenIds.add(id);
    }

    for (const [id, entry] of currentById) {
      if (!seenIds.has(id)) {
        ordered.push(entry);
      }
    }

    return ordered;
  }

  const currentIds = new Set(current.map((entry) => entry.id));
  const mergedCurrent = current
    .filter((entry) => !removedIds.has(entry.id))
    .map((entry) => currentById.get(entry.id) ?? entry);
  const appendedEntries = delta.upserted.filter((entry) => !currentIds.has(entry.id) && !removedIds.has(entry.id));

  return [...mergedCurrent, ...appendedEntries];
}

export function applySnapshotDelta(snapshot: ProxySnapshot, delta: ProxySnapshotDelta): ProxySnapshot {
  return {
    startedAt: delta.startedAt ?? snapshot.startedAt,
    queueDepth: delta.queueDepth ?? snapshot.queueDepth,
    recentRequestLimit: delta.recentRequestLimit ?? snapshot.recentRequestLimit,
    totals: delta.totals ?? snapshot.totals,
    backends: applyCollectionDelta(snapshot.backends, delta.backends),
    activeConnections: applyCollectionDelta(snapshot.activeConnections, delta.activeConnections),
    recentRequests: applyCollectionDelta(snapshot.recentRequests, delta.recentRequests),
  };
}
