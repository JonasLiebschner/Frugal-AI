import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { ConversationTranscriptItem, DashboardState, RequestLogDetail } from "../types/dashboard";
import {
  buildConnectionTransportBadges,
} from "../utils/dashboard-connection-badges";
import { buildRequestConversationItems } from "../utils/conversation-transcript";
import { buildRequestParamRows } from "../utils/dashboard-request-params";
import { buildRequestResponseMetricRows } from "../utils/dashboard-request-metrics";
import { buildRequestRoutingBadges, buildRequestStateBadge } from "../utils/dashboard-request-badges";
import { isClientRecord } from "../utils/guards";
import {
  isActiveRequestId,
  REQUEST_DETAIL_CACHE_LIMIT,
  resolveCachedRequestDetail,
  storeRequestDetailInCache,
} from "../utils/request-detail-runtime";
import {
  buildRequestDetailSubtitle,
  buildRequestDetailTitle,
  resolveRequestLiveConnection,
} from "../utils/request-detail-view";
import {
  clearRequestDetailLinkQuery,
  fetchJsonWithTimeout,
  readRequestDetailLinkState,
  resolveDashboardPagePath,
  type RequestDetailLinkQuery,
  type RequestDetailTab,
  withRequestDetailLinkQuery,
} from "../../llmproxy-client";

const REQUEST_DETAIL_TIMEOUT_MS = 8000;
const LOGS_PAGE_PATH = resolveDashboardPagePath("logs");

export function useRequestDetail(
  state: DashboardState,
  onErrorToast: (title: string, message: string) => void,
) {
  const route = useRoute();
  const router = useRouter();
  let liveDetailEventSource: EventSource | null = null;
  let liveDetailRequestId = "";
  let routeOwnsRequestDetail = false;
  let routeSyncDepth = 0;
  let stopRouteSyncWatch: (() => void) | null = null;
  let stopTabSyncWatch: (() => void) | null = null;

  function isLogsPageRoute(): boolean {
    return route.path === LOGS_PAGE_PATH;
  }

  function isRouteSyncing(): boolean {
    return routeSyncDepth > 0;
  }

  function beginRouteSync(): void {
    routeSyncDepth += 1;
  }

  function endRouteSync(): void {
    routeSyncDepth = Math.max(0, routeSyncDepth - 1);
  }

  function replaceRequestDetailQuery(nextQuery: RequestDetailLinkQuery): void {
    beginRouteSync();
    void router.replace({ query: nextQuery }).finally(() => {
      endRouteSync();
    });
  }

  function syncRequestDetailQuery(requestId: string, tab: RequestDetailTab): void {
    if (!isLogsPageRoute()) {
      return;
    }

    const currentQuery = route.query as RequestDetailLinkQuery;
    const nextQuery = requestId
      ? withRequestDetailLinkQuery(currentQuery, requestId, tab)
      : clearRequestDetailLinkQuery(currentQuery);
    const currentState = readRequestDetailLinkState(currentQuery);
    const nextState = readRequestDetailLinkState(nextQuery);
    const currentHasExplicitTab = Object.prototype.hasOwnProperty.call(currentQuery, "requestTab");
    const nextHasExplicitTab = Object.prototype.hasOwnProperty.call(nextQuery, "requestTab");
    if (
      currentState.requestId === nextState.requestId
      && currentState.tab === nextState.tab
      && currentHasExplicitTab === nextHasExplicitTab
    ) {
      return;
    }

    replaceRequestDetailQuery(nextQuery);
  }

  function stopLiveRequestDetailFeed(): void {
    if (liveDetailEventSource) {
      liveDetailEventSource.close();
      liveDetailEventSource = null;
    }

    liveDetailRequestId = "";
  }

  function startLiveRequestDetailFeed(requestId: string): void {
    if (typeof EventSource === "undefined") {
      return;
    }

    if (liveDetailEventSource && liveDetailRequestId === requestId) {
      return;
    }

    stopLiveRequestDetailFeed();
    liveDetailRequestId = requestId;
    liveDetailEventSource = new EventSource(`/api/llmproxy/admin/requests/${encodeURIComponent(requestId)}/events`);
    liveDetailEventSource.addEventListener("request_detail", (event: MessageEvent) => {
      try {
        const detail = JSON.parse(event.data) as RequestLogDetail;
        if (state.requestDetail.requestId !== requestId) {
          stopLiveRequestDetailFeed();
          return;
        }

        applyLiveRequestDetail(detail);
      } catch {
        return;
      }
    });
  }

  function syncLiveRequestDetailFeed(): void {
    const requestId = state.requestDetail.requestId;
    const shouldKeepFeedOpen = state.requestDetail.detail?.live === true
      || state.requestDetail.detail?.otel?.pending === true;
    if (!state.requestDetail.open || !requestId || !shouldKeepFeedOpen) {
      stopLiveRequestDetailFeed();
      return;
    }

    startLiveRequestDetailFeed(requestId);
  }

  async function loadRequestDetail(requestId: string, useCache = true): Promise<boolean> {
    const cachedDetail = resolveCachedRequestDetail(
      state.snapshot.activeConnections,
      state.requestDetail.cache,
      requestId,
      useCache,
    );
    if (cachedDetail) {
      state.requestDetail.detail = cachedDetail;
      state.requestDetail.loading = false;
      return true;
    }

    state.requestDetail.loading = true;
    state.requestDetail.error = "";

    try {
      const detail = await fetchJsonWithTimeout<RequestLogDetail>(`/api/llmproxy/admin/requests/${encodeURIComponent(requestId)}`, {
        method: "GET",
        timeoutMs: REQUEST_DETAIL_TIMEOUT_MS,
      });
      if (state.requestDetail.requestId !== requestId) {
        return false;
      }

      state.requestDetail.detail = detail;
      state.requestDetail.loading = false;

      if (!detail.live) {
        storeRequestDetailInCache(state.requestDetail.cache, detail, REQUEST_DETAIL_CACHE_LIMIT);
      }

      return true;
    } catch (error) {
      if (state.requestDetail.requestId !== requestId) {
        return false;
      }

      const message = error instanceof Error ? error.message : String(error);
      state.requestDetail.loading = false;
      state.requestDetail.error = message;
      onErrorToast("Request details", message);
      return false;
    }
  }

  async function openRequestDetail(
    requestId: string,
    tab: RequestDetailTab = "request",
  ): Promise<void> {
    const nextTab = tab;
    if (isLogsPageRoute() && !isRouteSyncing()) {
      routeOwnsRequestDetail = true;
      syncRequestDetailQuery(requestId, nextTab);
    }

    stopLiveRequestDetailFeed();
    const previousState = {
      open: state.requestDetail.open,
      requestId: state.requestDetail.requestId,
      tab: state.requestDetail.tab,
      error: state.requestDetail.error,
      detail: state.requestDetail.detail,
      loading: state.requestDetail.loading,
    };
    const keepDialogOpenOnLoadFailure = isActiveRequestId(state.snapshot.activeConnections, requestId);
    const cachedDetail = !keepDialogOpenOnLoadFailure
      ? state.requestDetail.cache[requestId] ?? null
      : null;
    const shouldKeepCurrentDetail = previousState.requestId === requestId && previousState.detail;

    state.requestDetail.requestId = requestId;
    state.requestDetail.tab = nextTab;
    state.requestDetail.open = true;
    state.requestDetail.error = "";
    state.requestDetail.detail = shouldKeepCurrentDetail ? previousState.detail : cachedDetail;
    state.requestDetail.loading = true;
    const loaded = await loadRequestDetail(requestId);

    if (loaded || keepDialogOpenOnLoadFailure) {
      syncLiveRequestDetailFeed();
      return;
    }

    state.requestDetail.open = previousState.open;
    state.requestDetail.requestId = previousState.requestId;
    state.requestDetail.tab = previousState.tab;
    state.requestDetail.error = previousState.error;
    state.requestDetail.detail = previousState.detail;
    state.requestDetail.loading = previousState.loading;
    syncLiveRequestDetailFeed();
  }

  async function refreshRequestDetail(requestId = state.requestDetail.requestId, useCache = false): Promise<void> {
    if (!requestId) {
      return;
    }

    await loadRequestDetail(requestId, useCache);
    syncLiveRequestDetailFeed();
  }

  function closeRequestDetail(): void {
    const shouldSyncRoute = routeOwnsRequestDetail && isLogsPageRoute() && !isRouteSyncing();
    if (shouldSyncRoute) {
      syncRequestDetailQuery("", "request");
    }

    routeOwnsRequestDetail = false;
    stopLiveRequestDetailFeed();
    state.requestDetail.open = false;
    state.requestDetail.loading = false;
    state.requestDetail.requestId = "";
    state.requestDetail.tab = "request";
    state.requestDetail.error = "";
    state.requestDetail.detail = null;
  }

  function syncRequestDetailFromRoute(): void {
    if (isRouteSyncing() || !isLogsPageRoute()) {
      return;
    }

    const { requestId, tab } = readRequestDetailLinkState(route.query as Record<string, unknown>);
    if (!requestId) {
      const shouldCloseOwnedRequest = routeOwnsRequestDetail && state.requestDetail.open;
      routeOwnsRequestDetail = false;
      if (shouldCloseOwnedRequest) {
        closeRequestDetail();
      }

      return;
    }

    routeOwnsRequestDetail = true;
    if (state.requestDetail.open && state.requestDetail.requestId === requestId) {
      if (state.requestDetail.tab !== tab) {
        state.requestDetail.tab = tab;
      }

      return;
    }

    beginRouteSync();
    void openRequestDetail(requestId, tab).finally(() => {
      endRouteSync();
    });
  }

  function applyLiveRequestDetail(detail: RequestLogDetail): void {
    if (state.requestDetail.requestId !== detail.entry.id) {
      return;
    }

    state.requestDetail.detail = detail;
    state.requestDetail.loading = false;
    state.requestDetail.error = "";

    if (!detail.live) {
      storeRequestDetailInCache(state.requestDetail.cache, detail, REQUEST_DETAIL_CACHE_LIMIT);
    }

    syncLiveRequestDetailFeed();
  }

  const requestBody = computed<Record<string, any> | null>(() => (
    isClientRecord(state.requestDetail.detail?.requestBody)
      ? state.requestDetail.detail?.requestBody as Record<string, any>
      : null
  ));

  const requestDetailTitle = computed(() => buildRequestDetailTitle(state.requestDetail.detail));
  const requestDetailSubtitle = computed(() => buildRequestDetailSubtitle(state.requestDetail.detail));
  const requestDetailIsLive = computed(() => state.requestDetail.detail?.live === true);

  const requestLiveConnection = computed(() => resolveRequestLiveConnection(
    state.snapshot.activeConnections,
    state.requestDetail.requestId,
    requestDetailIsLive.value,
  ));

  const requestLiveTransportBadges = computed(() => (
    requestLiveConnection.value ? buildConnectionTransportBadges(requestLiveConnection.value) : []
  ));
  const requestRoutingBadges = computed(() => buildRequestRoutingBadges(state.requestDetail.detail?.entry));

  const requestStateBadge = computed(() => buildRequestStateBadge(
    state.requestDetail.detail?.entry,
    Boolean(state.requestDetail.detail?.live && !requestLiveConnection.value),
  ));
  const requestResponseMetricRows = computed(() => buildRequestResponseMetricRows(state.requestDetail.detail?.entry, {
    requestBody: state.requestDetail.detail?.requestBody,
    responseBody: state.requestDetail.detail?.responseBody,
    backends: requestDetailIsLive.value ? state.snapshot.backends : [],
    live: requestDetailIsLive.value,
  }));
  const requestParamRows = computed(() => buildRequestParamRows(
    requestBody.value,
    state.requestDetail.detail?.entry.requestType,
  ));
  const requestConversationItems = computed<ConversationTranscriptItem[]>(() => (
    buildRequestConversationItems(state.requestDetail.detail, {
      includeRequestMessages: true,
      hideFinishBadge: true,
      reasoningCollapsed: true,
    })
  ));

  onMounted(() => {
    stopRouteSyncWatch = watch(
      () => [route.path, route.query.requestId, route.query.requestTab] as const,
      () => {
        syncRequestDetailFromRoute();
      },
      { immediate: true },
    );
    stopTabSyncWatch = watch(
      () => state.requestDetail.tab,
      (tab) => {
        if (!state.requestDetail.open || !state.requestDetail.requestId) {
          return;
        }

        if (!routeOwnsRequestDetail || !isLogsPageRoute() || isRouteSyncing()) {
          return;
        }

        syncRequestDetailQuery(state.requestDetail.requestId, tab);
      },
    );
  });

  onBeforeUnmount(() => {
    stopRouteSyncWatch?.();
    stopRouteSyncWatch = null;
    stopTabSyncWatch?.();
    stopTabSyncWatch = null;
  });

  return {
    closeRequestDetail,
    openRequestDetail,
    refreshRequestDetail,
    requestDetailSubtitle,
    requestDetailTitle,
    requestLiveTransportBadges,
    requestRoutingBadges,
    requestConversationItems,
    requestParamRows,
    requestResponseMetricRows,
    requestStateBadge,
    applyLiveRequestDetail,
  };
}
