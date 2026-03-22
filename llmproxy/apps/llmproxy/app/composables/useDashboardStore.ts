import { computed, reactive, shallowReactive } from "vue";
import type { DashboardState } from "../types/dashboard";
import {
  createAiRequestMiddlewareEditorFields,
  createDefaultBackendEditorFields,
  createOtelEditorFields,
  createServerEditorFields,
} from "../../llmproxy-client";
import {
  badgeClass,
} from "../utils/dashboard-badges";
import {
  buildConnectionCardBadges,
  buildConnectionMetricBadges,
} from "../utils/dashboard-connection-badges";
import { buildRecentRequestMetrics } from "../utils/dashboard-request-metrics";
import { buildRecentRequestBadges } from "../utils/dashboard-request-badges";
import { buildSummaryCards } from "../utils/dashboard-summary-cards";
import { createInitialDebugMetrics } from "../utils/debug-chat-metrics";
import { shortId } from "../utils/formatters";
import { applySnapshotDelta as mergeSnapshotDelta } from "../utils/snapshot-delta";
import { useDebugChat } from "./useDebugChat";
import { useActiveRequestCancellation } from "./useActiveRequestCancellation";
import { useBackendControls } from "./useBackendControls";
import { useDashboardToasts } from "./useDashboardToasts";
import { useLiveFeed } from "./useLiveFeed";
import { useRequestDetail } from "./useRequestDetail";

function createEmptySnapshot(): DashboardState["snapshot"] {
  return {
    startedAt: "",
    queueDepth: 0,
    recentRequestLimit: 1000,
    totals: {
      activeRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cancelledRequests: 0,
      rejectedRequests: 0,
    },
    backends: [],
    activeConnections: [],
    recentRequests: [],
  };
}

function createInitialState(): DashboardState {
  return {
    snapshot: createEmptySnapshot(),
    mcpEnabled: null,
    connectionStatus: "connecting",
    connectionText: "Connecting to live feed",
    models: [],
    configSchemas: reactive({}),
    serverConfig: null,
    otelConfig: null,
    aiRequestMiddlewares: [],
    requestDetail: reactive({
      open: false,
      loading: false,
      requestId: "",
      tab: "request",
      error: "",
      detail: null,
      cache: {},
    }),
    backendConfigs: reactive({}),
    backendEditor: reactive({
      open: false,
      mode: "create",
      originalId: "",
      saving: false,
      deleting: false,
      loading: false,
      error: "",
      fields: createDefaultBackendEditorFields(),
    }),
    serverEditor: reactive({
      open: false,
      saving: false,
      loading: false,
      error: "",
      notice: "",
      noticeTone: "neutral",
      appliedImmediatelyFields: [],
      fields: createServerEditorFields(),
    }),
    otelEditor: reactive({
      open: false,
      saving: false,
      loading: false,
      error: "",
      notice: "",
      noticeTone: "neutral",
      fields: createOtelEditorFields(),
    }),
    aiRequestMiddlewareEditor: reactive({
      open: false,
      mode: "create",
      originalId: "",
      saving: false,
      deleting: false,
      loading: false,
      error: "",
      fields: createAiRequestMiddlewareEditorFields(),
    }),
    debug: reactive({
      model: "auto",
      systemPrompt: "",
      prompt: "",
      defaultPromptDismissed: false,
      queuedMessages: [],
      enableDiagnosticTools: true,
      stream: true,
      sending: false,
      abortController: null,
      backend: "",
      status: "",
      usage: "",
      error: "",
      lastRequestId: "",
      rawRequest: "",
      rawResponse: "",
      transcript: [],
      metrics: createInitialDebugMetrics(),
      params: {
        temperature: 0.7,
        top_p: 0.95,
        top_k: 40,
        min_p: 0.05,
        repeat_penalty: 1.1,
        max_completion_tokens: 20000,
        tool_choice: "auto",
      },
      dialogOpen: false,
    }),
    toasts: reactive([] as DashboardState["toasts"]),
  };
}

function createDashboardStoreInternal() {
  const state = shallowReactive(createInitialState()) as DashboardState;
  const toasts = useDashboardToasts(state);
  const backendControls = useBackendControls(state, toasts.showToast);
  const requestDetail = useRequestDetail(state, toasts.showToast);
  const debugChat = useDebugChat(state, toasts.showToast);
  const activeRequestCancellation = useActiveRequestCancellation(state, toasts.showToast);

  const applySnapshot = (snapshot: typeof state.snapshot): void => {
    backendControls.applySnapshot(snapshot);
    activeRequestCancellation.syncActiveRequestState(snapshot);
  };

  const applyLiveRequestDetail = (detail: NonNullable<DashboardState["requestDetail"]["detail"]>): void => {
    requestDetail.applyLiveRequestDetail(detail);
  };

  const applyDelta = (delta: Parameters<typeof mergeSnapshotDelta>[1]): void => {
    applySnapshot(mergeSnapshotDelta(state.snapshot, delta));
  };

  const liveFeed = useLiveFeed(state, applySnapshot, applyDelta, applyLiveRequestDetail, toasts.showToast);
  const summaryCards = computed(() => buildSummaryCards(state.snapshot));

  let started = false;

  function syncLiveFeed(): void {
    if (!started) {
      return;
    }

    liveFeed.connectLiveFeed();
  }

  function start(): void {
    if (started) {
      return;
    }

    started = true;
    backendControls.ensureDebugModel();
    void (async () => {
      await backendControls.loadConnectionConfigs();
      if (!started) {
        return;
      }

      await backendControls.refreshDashboardSnapshot();
      if (!started) {
        return;
      }

      syncLiveFeed();
    })();
  }

  function stop(): void {
    if (!started) {
      return;
    }

    started = false;
    liveFeed.stopLiveFeed();
    debugChat.stopDebugMetricsTicker();
    toasts.stopToastTimers();
  }

  return reactive({
    state,
    summaryCards,
    requestDetailTitle: requestDetail.requestDetailTitle,
    requestDetailSubtitle: requestDetail.requestDetailSubtitle,
    requestLiveTransportBadges: requestDetail.requestLiveTransportBadges,
    requestRoutingBadges: requestDetail.requestRoutingBadges,
    requestConversationItems: requestDetail.requestConversationItems,
    requestStateBadge: requestDetail.requestStateBadge,
    requestResponseMetricRows: requestDetail.requestResponseMetricRows,
    requestParamRows: requestDetail.requestParamRows,
    badgeClass,
    connectionCardBadges: buildConnectionCardBadges,
    connectionMetricBadges: buildConnectionMetricBadges,
    openRequestDetail: requestDetail.openRequestDetail,
    closeRequestDetail: requestDetail.closeRequestDetail,
    canCancelRequest: activeRequestCancellation.canCancelRequest,
    cancelActiveRequest: activeRequestCancellation.cancelActiveRequest,
    isRequestCancelling: activeRequestCancellation.isRequestCancelling,
    openCreateBackend: backendControls.openCreateBackend,
    openEditBackend: backendControls.openEditBackend,
    closeBackendEditor: backendControls.closeBackendEditor,
    saveBackendEditor: backendControls.saveBackendEditor,
    deleteBackendEditor: backendControls.deleteBackendEditor,
    deleteBackendById: backendControls.deleteBackendById,
    openServerEditor: backendControls.openServerEditor,
    closeServerEditor: backendControls.closeServerEditor,
    saveServerEditor: backendControls.saveServerEditor,
    openOtelEditor: backendControls.openOtelEditor,
    closeOtelEditor: backendControls.closeOtelEditor,
    saveOtelEditor: backendControls.saveOtelEditor,
    openCreateAiRequestMiddleware: backendControls.openCreateAiRequestMiddleware,
    openEditAiRequestMiddleware: backendControls.openEditAiRequestMiddleware,
    closeAiRequestMiddlewareEditor: backendControls.closeAiRequestMiddlewareEditor,
    saveAiRequestMiddlewareEditor: backendControls.saveAiRequestMiddlewareEditor,
    deleteAiRequestMiddlewareEditor: backendControls.deleteAiRequestMiddlewareEditor,
    deleteAiRequestMiddlewareById: backendControls.deleteAiRequestMiddlewareById,
    sendDebugChat: debugChat.sendDebugChat,
    stopDebugChat: debugChat.stopDebugChat,
    clearDebugChat: debugChat.clearDebugChat,
    ensureDefaultDebugPrompt: debugChat.ensureDefaultDebugPrompt,
    prepareDebugChatDraft: debugChat.prepareDebugChatDraft,
    openDebugChatDialog: () => {
      debugChat.ensureDefaultDebugPrompt();
      state.debug.dialogOpen = true;
    },
    startDebugChatDialog: (systemPrompt: string, prompt: string) => {
      debugChat.prepareDebugChatDraft(systemPrompt, prompt);
      state.debug.dialogOpen = true;
      void debugChat.sendDebugChat();
    },
    closeDebugChatDialog: () => {
      state.debug.dialogOpen = false;
    },
    openLastDebugRequest: () => {
      if (!state.debug.lastRequestId) {
        return;
      }

      void requestDetail.openRequestDetail(state.debug.lastRequestId);
    },
    shortId,
    recentRequestBadges: buildRecentRequestBadges,
    recentRequestMetrics: buildRecentRequestMetrics,
    showToast: toasts.showToast,
    dismissToast: toasts.dismissToast,
    start,
    stop,
  });
}

export type DashboardStore = ReturnType<typeof createDashboardStoreInternal>;

let dashboardStore: DashboardStore | null = null;

export function useDashboardStore(): DashboardStore {
  if (!dashboardStore) {
    dashboardStore = createDashboardStoreInternal();
  }

  return dashboardStore;
}
