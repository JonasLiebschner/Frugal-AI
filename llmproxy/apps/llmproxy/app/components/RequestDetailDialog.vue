<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import ConversationTranscript from "./ConversationTranscript.vue";
import ConversationSurface from "./ConversationSurface.vue";
import DiagnosticActionsView from "./DiagnosticActionsView.vue";
import DiagnosticReportView from "./DiagnosticReportView.vue";
import DialogCloseButton from "./DialogCloseButton.vue";
import ToolDefinitionsView from "./ToolDefinitionsView.vue";
import type { DiagnosticReport } from "../types/dashboard";
import { useDashboardStore } from "../composables/useDashboardStore";
import { useDialogEscape } from "../composables/useDialogEscape";
import { fetchWithTimeout, readJsonResponse } from "../../llmproxy-client";

type RawPayloadKind = "request" | "response";
type InspectorTab = "request" | "response" | "diagnosis" | "tools" | "otel";
const DIAGNOSTICS_REPORT_TIMEOUT_MS = 8000;

const store = useDashboardStore();
const activeInspectorTab = ref<InspectorTab>("request");
const activeRawPayload = ref<{
  kind: RawPayloadKind;
  title: string;
  value: unknown;
} | null>(null);
const diagnosticsReport = ref<DiagnosticReport | null>(null);
const diagnosticsLoading = ref(false);
const diagnosticsError = ref("");
let previousDocumentOverflow = "";
let previousBodyOverflow = "";
let scrollLockApplied = false;

const otelEnabled = computed(() => store.state.otelConfig?.enabled === true);
const otelDebug = computed(() => store.state.requestDetail.detail?.otel ?? null);
const otelExportStatus = computed(() => {
  if (!otelEnabled.value) {
    return "";
  }

  if (otelDebug.value?.result?.outcome === "success") {
    return "Export delivered";
  }

  if (otelDebug.value?.result?.outcome === "failed") {
    return "Export failed";
  }

  if (otelDebug.value?.pending) {
    return "Export pending";
  }

  return "No export recorded yet";
});

function setBackgroundScrollLocked(locked: boolean): void {
  if (typeof document === "undefined") {
    return;
  }

  const { documentElement, body } = document;
  if (locked) {
    if (!scrollLockApplied) {
      previousDocumentOverflow = documentElement.style.overflow;
      previousBodyOverflow = body.style.overflow;
      scrollLockApplied = true;
    }

    documentElement.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return;
  }

  if (!scrollLockApplied) {
    return;
  }

  documentElement.style.overflow = previousDocumentOverflow;
  body.style.overflow = previousBodyOverflow;
  scrollLockApplied = false;
}

const requestConversationSignature = computed(() => [
  store.state.requestDetail.open ? "open" : "closed",
  store.state.requestDetail.requestId,
  store.requestConversationItems.length,
  store.requestConversationItems.map((item) => `${item.index}:${item.finishReason || ""}`).join("|"),
].join("|"));

const rawPayloadDialogTitle = computed(() => {
  if (!activeRawPayload.value) {
    return "";
  }

  return `${store.requestDetailTitle} · ${activeRawPayload.value.kind === "request" ? "Raw Request Data" : "Raw Response Data"}`;
});

const requestResponseNote = computed(() => {
  const note = store.state.requestDetail.detail?.entry.error;
  return typeof note === "string" ? note.trim() : "";
});

watch(
  () => [store.state.requestDetail.open, store.state.requestDetail.requestId, store.state.requestDetail.tab] as const,
  () => {
    activeInspectorTab.value = normalizeInspectorTab(store.state.requestDetail.tab);
    activeRawPayload.value = null;
  },
);

watch(
  () => [
    store.state.requestDetail.open,
    store.state.requestDetail.requestId,
    store.state.requestDetail.detail?.live,
  ] as const,
  ([open, requestId, live]) => {
    diagnosticsReport.value = null;
    diagnosticsError.value = "";

    if (!open || !requestId) {
      diagnosticsLoading.value = false;
      return;
    }

    if (live === true) {
      diagnosticsLoading.value = false;
      return;
    }

    void loadDiagnosticsReport(requestId);
  },
  { immediate: true },
);

watch(
  () => store.state.requestDetail.open,
  (open) => {
    setBackgroundScrollLocked(open);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  setBackgroundScrollLocked(false);
});

useDialogEscape(
  () => store.state.requestDetail.open,
  () => {
    if (activeRawPayload.value) {
      return;
    }

    store.closeRequestDetail();
  },
);

useDialogEscape(
  () => activeRawPayload.value !== null,
  closeRawPayloadInspector,
);

function selectInspectorTab(tab: InspectorTab): void {
  activeInspectorTab.value = tab;
  store.state.requestDetail.tab = tab;
}

function normalizeInspectorTab(tab: string | undefined): InspectorTab {
  if (tab === "otel") {
    return otelEnabled.value ? "otel" : "request";
  }

  if (tab === "request" || tab === "response" || tab === "diagnosis" || tab === "tools") {
    return tab;
  }

  return "request";
}

function getRawPayloadValue(kind: RawPayloadKind): unknown {
  const detail = store.state.requestDetail.detail as {
    requestBody?: unknown;
    responseBody?: unknown;
  } | null;
  if (!detail) {
    return undefined;
  }

  return kind === "request" ? detail.requestBody : detail.responseBody;
}

function hasRawPayload(kind: RawPayloadKind): boolean {
  const value = getRawPayloadValue(kind);
  return value !== undefined && value !== null && value !== "";
}

function openRawPayloadInspector(kind: RawPayloadKind): void {
  const value = getRawPayloadValue(kind);
  if (value === undefined || value === null || value === "") {
    return;
  }

  activeRawPayload.value = {
    kind,
    title: kind === "request" ? "Raw Request" : "Raw Response",
    value,
  };
}

function closeRawPayloadInspector(): void {
  activeRawPayload.value = null;
}

async function loadDiagnosticsReport(requestId: string): Promise<void> {
  diagnosticsLoading.value = true;

  try {
    const response = await fetchWithTimeout(`/api/llmproxy/admin/diagnostics/requests/${encodeURIComponent(requestId)}`, {
      method: "GET",
      timeoutMs: DIAGNOSTICS_REPORT_TIMEOUT_MS,
    });

    if (response.status === 404) {
      diagnosticsReport.value = null;
      diagnosticsError.value = "";
      return;
    }
    const payload = await readJsonResponse<{ report: DiagnosticReport }>(response);
    if (store.state.requestDetail.requestId !== requestId) {
      return;
    }

    diagnosticsReport.value = payload.report;
    diagnosticsError.value = "";
  } catch (error) {
    if (store.state.requestDetail.requestId !== requestId) {
      return;
    }

    diagnosticsReport.value = null;
    diagnosticsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (store.state.requestDetail.requestId === requestId) {
      diagnosticsLoading.value = false;
    }
  }
}

function serializePayloadForClipboard(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

async function copyRawPayload(kind: RawPayloadKind): Promise<void> {
  const value = getRawPayloadValue(kind);
  if (value === undefined || value === null || value === "") {
    return;
  }

  const label = kind === "request" ? "Raw request" : "Raw response";
  try {
    await navigator.clipboard.writeText(serializePayloadForClipboard(value));
    store.showToast("Request debugger", `${label} copied to clipboard.`, "good", 2600);
  } catch (error) {
    store.showToast("Request debugger", error instanceof Error ? error.message : String(error));
  }
}

</script>

<template>
  <div
    v-if="store.state.requestDetail.open"
    class="request-detail-overlay"
    @click.self="store.closeRequestDetail()"
  >
    <div class="request-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="request-detail-title">
      <div class="panel-header">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h2 id="request-detail-title" class="panel-title">{{ store.requestDetailTitle }}</h2>
            <div
              v-if="store.requestLiveTransportBadges.length || store.requestStateBadge || store.requestRoutingBadges.length"
              class="request-meta"
            >
              <template v-if="store.requestLiveTransportBadges.length">
                <span
                  v-for="badge in store.requestLiveTransportBadges"
                  :key="badge.text + (badge.title || '')"
                  :class="store.badgeClass(badge)"
                  :title="badge.title"
                >
                  {{ badge.text }}
                </span>
              </template>
              <template v-if="store.requestStateBadge">
                <span
                  :class="store.badgeClass(store.requestStateBadge)"
                  :title="store.requestStateBadge.title"
                >
                  {{ store.requestStateBadge.text }}
                </span>
              </template>
              <span
                v-for="badge in store.requestRoutingBadges"
                :key="badge.text + (badge.title || '')"
                :class="store.badgeClass(badge)"
                :title="badge.title"
              >
                {{ badge.text }}
              </span>
            </div>
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-2">
            <p class="hint m-0">{{ store.requestDetailSubtitle }}</p>
          </div>
        </div>
        <div class="request-actions">
          <button
            v-if="store.canCancelRequest(store.state.requestDetail.requestId)"
            class="icon-button danger compact"
            type="button"
            :disabled="store.isRequestCancelling(store.state.requestDetail.requestId)"
            :aria-label="store.isRequestCancelling(store.state.requestDetail.requestId) ? 'Ending the active connection' : 'End this active connection'"
            :title="store.isRequestCancelling(store.state.requestDetail.requestId) ? 'Ending the active connection...' : 'End this active connection after confirmation.'"
            @click="store.cancelActiveRequest(store.state.requestDetail.requestId)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3.5v7"></path>
              <path d="M7.05 6.05a7 7 0 1 0 9.9 0"></path>
            </svg>
          </button>
          <DialogCloseButton
            compact
            title="Close request details"
            aria-label="Close request details"
            @click="store.closeRequestDetail()"
          />
        </div>
      </div>

      <div class="request-detail-grid">
        <div class="request-detail-card request-detail-inspector-card">
          <div class="request-detail-tab-bar" role="tablist" aria-label="Request detail sections">
            <button
              type="button"
              class="request-detail-tab-button"
              :class="{ active: activeInspectorTab === 'request' }"
              role="tab"
              :aria-selected="activeInspectorTab === 'request'"
              @click="selectInspectorTab('request')"
            >
              <span>Request</span>
            </button>
            <button
              type="button"
              class="request-detail-tab-button"
              :class="{ active: activeInspectorTab === 'response' }"
              role="tab"
              :aria-selected="activeInspectorTab === 'response'"
              @click="selectInspectorTab('response')"
            >
              <span>Response</span>
            </button>
            <button
              type="button"
              class="request-detail-tab-button"
              :class="{ active: activeInspectorTab === 'tools' }"
              role="tab"
              :aria-selected="activeInspectorTab === 'tools'"
              @click="selectInspectorTab('tools')"
            >
              Tools
            </button>
            <button
              v-if="otelEnabled"
              type="button"
              class="request-detail-tab-button"
              :class="{ active: activeInspectorTab === 'otel' }"
              role="tab"
              :aria-selected="activeInspectorTab === 'otel'"
              @click="selectInspectorTab('otel')"
            >
              <span>OpenTelemetry</span>
            </button>
            <button
              type="button"
              class="request-detail-tab-button"
              :class="{ active: activeInspectorTab === 'diagnosis' }"
              role="tab"
              :aria-selected="activeInspectorTab === 'diagnosis'"
              @click="selectInspectorTab('diagnosis')"
            >
              <span>Analyzer</span>
            </button>
          </div>
          <div class="detail-card-viewport">
            <div v-if="store.state.requestDetail.loading && !store.state.requestDetail.detail" class="empty">
              Loading request details...
            </div>
            <div v-else-if="store.state.requestDetail.error && !store.state.requestDetail.detail" class="empty">
              {{ store.state.requestDetail.error }}
            </div>
            <section v-else-if="activeInspectorTab === 'request'" class="request-detail-section">
              <div v-if="store.requestParamRows.length" class="detail-table-wrap">
                <table class="detail-table">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in store.requestParamRows" :key="row.key + row.value">
                      <td class="detail-table-key">
                        <span class="detail-table-key-label" :title="row.title">{{ row.key }}</span>
                      </td>
                      <td :title="row.title" class="detail-table-value mono">{{ row.value }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="empty">No additional top-level request fields were stored.</div>
              <div v-if="hasRawPayload('request')" class="mt-3 flex justify-start">
                <button
                  class="context-action-button"
                  type="button"
                  title="Open the stored raw request payload in a full-screen inspector"
                  aria-label="Open the stored raw request payload in a full-screen inspector"
                  @click="openRawPayloadInspector('request')"
                >
                  <span class="context-action-button-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M9 6.5V5.25a3 3 0 0 1 6 0V6.5"></path>
                      <path d="M8.5 8h7A1.5 1.5 0 0 1 17 9.5v4.9a5 5 0 0 1-10 0V9.5A1.5 1.5 0 0 1 8.5 8Z"></path>
                      <path d="M12 3.5v1.75"></path>
                      <path d="M7 11.75H4.75"></path>
                      <path d="M19.25 11.75H17"></path>
                      <path d="M7.2 9.35 5.25 7.8"></path>
                      <path d="M16.8 9.35 18.75 7.8"></path>
                      <path d="M7.2 15.65 5.25 17.2"></path>
                      <path d="M16.8 15.65 18.75 17.2"></path>
                    </svg>
                  </span>
                  <span class="context-action-button-label">Show raw request data</span>
                </button>
              </div>
            </section>

            <section v-else-if="activeInspectorTab === 'response'" class="request-detail-section">
              <div v-if="requestResponseNote" class="request-detail-note-box" role="note" aria-label="Request note">
                <div class="request-detail-note-label">Note</div>
                <p class="request-detail-note-copy">{{ requestResponseNote }}</p>
              </div>
              <div v-if="store.requestResponseMetricRows.length" class="detail-table-wrap">
                <table class="detail-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in store.requestResponseMetricRows" :key="row.key + row.value">
                      <td class="detail-table-key">
                        <span class="detail-table-key-label" :title="row.title">{{ row.key }}</span>
                      </td>
                      <td :title="row.title" class="detail-table-value">
                        <div class="detail-table-value-content">
                          <span class="mono">{{ row.value }}</span>
                          <template v-if="row.valueBadges?.length">
                            <span
                              v-for="badge in row.valueBadges"
                              :key="row.key + badge.text + (badge.title || '')"
                              :class="`${store.badgeClass(badge)} detail-table-value-badge`"
                              :title="badge.title"
                            >
                              {{ badge.text }}
                            </span>
                          </template>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="empty">No response metrics have been recorded yet.</div>
              <div v-if="hasRawPayload('response')" class="mt-3 flex justify-start">
                <button
                  class="context-action-button"
                  type="button"
                  title="Open the stored raw response payload in a full-screen inspector"
                  aria-label="Open the stored raw response payload in a full-screen inspector"
                  @click="openRawPayloadInspector('response')"
                >
                  <span class="context-action-button-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M9 6.5V5.25a3 3 0 0 1 6 0V6.5"></path>
                      <path d="M8.5 8h7A1.5 1.5 0 0 1 17 9.5v4.9a5 5 0 0 1-10 0V9.5A1.5 1.5 0 0 1 8.5 8Z"></path>
                      <path d="M12 3.5v1.75"></path>
                      <path d="M7 11.75H4.75"></path>
                      <path d="M19.25 11.75H17"></path>
                      <path d="M7.2 9.35 5.25 7.8"></path>
                      <path d="M16.8 9.35 18.75 7.8"></path>
                      <path d="M7.2 15.65 5.25 17.2"></path>
                      <path d="M16.8 15.65 18.75 17.2"></path>
                    </svg>
                  </span>
                  <span class="context-action-button-label">Show raw response data</span>
                </button>
              </div>
            </section>

            <section v-else-if="activeInspectorTab === 'otel'" class="request-detail-section">
              <div class="request-detail-note-box" role="note" aria-label="OpenTelemetry export status">
                <div class="request-detail-note-label">Export status</div>
                <p class="request-detail-note-copy">{{ otelExportStatus }}</p>
              </div>
              <div v-if="otelDebug?.span !== undefined" class="mt-3">
                <div class="request-detail-note-label mb-2">Recorded trace span</div>
                <CodeViewer
                  :value="otelDebug.span"
                  placeholder="No OpenTelemetry trace span was captured for this request."
                />
              </div>
              <div v-if="otelDebug?.result" class="mt-3">
                <div class="request-detail-note-label mb-2">OTLP trace export response</div>
                <CodeViewer
                  :value="otelDebug.result"
                  placeholder="No OpenTelemetry export response was captured for this request."
                />
              </div>
              <div
                v-if="!otelDebug?.span && !otelDebug?.result"
                class="empty"
              >
                No OpenTelemetry export data has been captured for this request yet.
              </div>
            </section>

            <section v-else-if="activeInspectorTab === 'diagnosis'" class="request-detail-section">
              <DiagnosticReportView
                :report="diagnosticsReport"
                :loading="diagnosticsLoading"
                :error="diagnosticsError"
                :waiting-for-final="store.state.requestDetail.detail?.live === true"
              />
              <DiagnosticActionsView
                v-if="diagnosticsReport && store.state.requestDetail.requestId"
                :request-id="store.state.requestDetail.requestId"
                :report="diagnosticsReport"
              />
            </section>

            <section v-else class="request-detail-section">
              <ToolDefinitionsView :tools="store.state.requestDetail.detail?.requestBody && (store.state.requestDetail.detail.requestBody as Record<string, unknown>).tools" />
            </section>
          </div>
        </div>

        <ConversationSurface
          card-class="request-detail-card request-detail-conversation-shell"
          :reset-key="store.state.requestDetail.requestId"
          :scroll-signature="requestConversationSignature"
          follow-mode="latest-turn-start"
          :follow-anchor-active="Boolean(store.state.requestDetail.detail?.live)"
        >
          <section class="request-detail-section request-detail-conversation-panel">
            <div v-if="store.state.requestDetail.loading && !store.state.requestDetail.detail" class="empty">
              Loading conversation...
            </div>
            <div v-else-if="store.state.requestDetail.error && !store.state.requestDetail.detail" class="empty">
              {{ store.state.requestDetail.error }}
            </div>
            <ConversationTranscript
              v-else
              :items="store.requestConversationItems"
              empty-text="No OpenAI messages were stored for this request."
              bubble-layout
            />
          </section>
        </ConversationSurface>
      </div>
    </div>

    <div
      v-if="activeRawPayload"
      class="raw-payload-overlay"
      @click.self="closeRawPayloadInspector()"
    >
      <div
        class="raw-payload-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${activeRawPayload.kind}-payload-title`"
      >
        <div class="panel-header">
          <div>
            <h2 :id="`${activeRawPayload.kind}-payload-title`" class="panel-title">{{ rawPayloadDialogTitle }}</h2>
            <p class="hint m-0 mt-1.5">{{ store.requestDetailSubtitle }}</p>
          </div>
          <div class="request-actions">
            <button
              class="icon-button compact"
              type="button"
              :title="`Copy ${activeRawPayload.title.toLowerCase()} to clipboard`"
              :aria-label="`Copy ${activeRawPayload.title.toLowerCase()} to clipboard`"
              @click="copyRawPayload(activeRawPayload.kind)"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="10" height="10" rx="2"></rect>
                <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <DialogCloseButton
              compact
              :title="`Close ${activeRawPayload.title.toLowerCase()} inspector`"
              :aria-label="`Close ${activeRawPayload.title.toLowerCase()} inspector`"
              @click="closeRawPayloadInspector()"
            />
          </div>
        </div>

        <div class="raw-payload-body">
          <CodeViewer
            :value="activeRawPayload.value"
            :placeholder="`No ${activeRawPayload.title.toLowerCase()} was stored.`"
          />
        </div>
      </div>
    </div>
  </div>
</template>
