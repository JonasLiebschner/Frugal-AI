import type { ActiveConnectionRuntime } from "./ai-proxy-types";
import { buildActiveConnectionSnapshot, buildActiveRequestDetail } from "./ai-proxy-active-connections";
import type { BackendRuntimeSnapshot, ProxySnapshot, RequestLogDetail } from "../../shared/type-api";

interface BuildLiveRequestStateSnapshotOptions {
  loadBalancerSnapshot: ProxySnapshot;
  activeConnections: Iterable<ActiveConnectionRuntime>;
}

interface ResolveLiveRequestDetailOptions {
  requestId: string;
  activeConnections: ReadonlyMap<string, ActiveConnectionRuntime>;
  backendSnapshots: BackendRuntimeSnapshot[];
  resolveHistoricalDetail: (requestId: string) => RequestLogDetail | undefined;
}

export function buildLiveRequestStateSnapshot(
  options: BuildLiveRequestStateSnapshotOptions,
): ProxySnapshot {
  const { loadBalancerSnapshot, activeConnections } = options;

  return {
    ...loadBalancerSnapshot,
    activeConnections: Array.from(activeConnections)
      .sort((left, right) => left.receivedAt - right.receivedAt)
      .map((connection) => buildActiveConnectionSnapshot(connection, loadBalancerSnapshot.backends)),
  };
}

export function resolveLiveRequestDetail(
  options: ResolveLiveRequestDetailOptions,
): RequestLogDetail | undefined {
  const { requestId, activeConnections, backendSnapshots, resolveHistoricalDetail } = options;
  const connection = activeConnections.get(requestId);

  return connection
    ? buildActiveRequestDetail(connection, backendSnapshots)
    : resolveHistoricalDetail(requestId);
}
