import type { ActiveConnectionSnapshot, RequestLogDetail } from "../types/dashboard";

export const REQUEST_DETAIL_CACHE_LIMIT = 24;

export function isActiveRequestId(activeConnections: ActiveConnectionSnapshot[], requestId: string): boolean {
  return activeConnections.some((connection) => connection.id === requestId);
}

export function resolveCachedRequestDetail(
  activeConnections: ActiveConnectionSnapshot[],
  cache: Record<string, RequestLogDetail>,
  requestId: string,
  useCache: boolean,
): RequestLogDetail | null {
  if (!useCache || isActiveRequestId(activeConnections, requestId)) {
    return null;
  }

  return cache[requestId] ?? null;
}

export function storeRequestDetailInCache(
  cache: Record<string, RequestLogDetail>,
  detail: RequestLogDetail,
  limit = REQUEST_DETAIL_CACHE_LIMIT,
): void {
  cache[detail.entry.id] = detail;

  const cachedIds = Object.keys(cache);
  while (cachedIds.length > limit) {
    const oldestId = cachedIds.shift();
    if (!oldestId) {
      break;
    }

    delete cache[oldestId];
  }
}
