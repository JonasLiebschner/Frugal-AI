import type { EventStreamMessage } from "h3";
import { buildProxySnapshotDelta } from "./utils/snapshot-delta";
import type { SseCapability } from "../../sse/server/sse-capability";
import type { ProxySnapshot, RequestLogDetail } from "../../shared/type-api";

type LiveRequestBroadcastSse = Pick<
  SseCapability,
  "getTopicClientCount" | "hasSubscribers" | "broadcastTopic" | "closeTopicSubscribers"
>;

interface BroadcastAiProxyDashboardSnapshotOptions {
  sse: LiveRequestBroadcastSse;
  dashboardTopicId: string;
  latestDashboardSnapshot?: ProxySnapshot;
  getSnapshot: () => ProxySnapshot;
}

interface BroadcastAiProxyRequestDetailOptions {
  sse: LiveRequestBroadcastSse;
  requestDetailTopicPrefix: string;
  requestId: string;
  getRequestDetail: (requestId: string) => RequestLogDetail | undefined;
}

export function createAiProxySseEvent(event: string, payload: unknown): EventStreamMessage {
  return {
    event,
    data: JSON.stringify(payload),
  };
}

export function getAiProxyRequestDetailTopicId(
  requestDetailTopicPrefix: string,
  requestId: string,
): string {
  return `${requestDetailTopicPrefix}${requestId}`;
}

export function broadcastAiProxyDashboardSnapshot(
  options: BroadcastAiProxyDashboardSnapshotOptions,
): ProxySnapshot | undefined {
  const { sse, dashboardTopicId, latestDashboardSnapshot, getSnapshot } = options;
  if (sse.getTopicClientCount(dashboardTopicId) === 0) {
    return latestDashboardSnapshot;
  }

  const snapshot = getSnapshot();
  if (!latestDashboardSnapshot) {
    sse.broadcastTopic(dashboardTopicId, createAiProxySseEvent("snapshot", snapshot));
    return snapshot;
  }

  const delta = buildProxySnapshotDelta(latestDashboardSnapshot, snapshot);
  if (!delta) {
    return snapshot;
  }

  sse.broadcastTopic(dashboardTopicId, createAiProxySseEvent("snapshot_delta", delta));
  return snapshot;
}

export function broadcastAiProxyRequestDetail(
  options: BroadcastAiProxyRequestDetailOptions,
): void {
  const { sse, requestDetailTopicPrefix, requestId, getRequestDetail } = options;
  const topicId = getAiProxyRequestDetailTopicId(requestDetailTopicPrefix, requestId);
  if (!sse.hasSubscribers(topicId)) {
    return;
  }

  const detail = getRequestDetail(requestId);
  if (!detail) {
    sse.closeTopicSubscribers(topicId);
    return;
  }

  sse.broadcastTopic(
    topicId,
    createAiProxySseEvent("request_detail", detail),
    detail.live !== true && detail.otel?.pending !== true,
  );
}
