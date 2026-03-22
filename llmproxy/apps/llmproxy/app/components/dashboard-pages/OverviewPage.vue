<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import BackendTable from "../BackendTable.vue";
import ConnectionPanel from "../ConnectionPanel.vue";
import { useDashboardStore } from "../../composables/useDashboardStore";
import type { SummaryCard } from "../../types/dashboard";
import { resolveDashboardPage, resolveDashboardPagePath } from "../../../llmproxy-client";

const store = useDashboardStore();
const router = useRouter();

const chatCompletionConnections = computed(() => (
  store.state.snapshot.activeConnections.filter((connection) => connection.kind === "chat.completions")
));

const activeConnections = computed(() => (
  chatCompletionConnections.value.filter((connection) => connection.phase !== "queued" || Boolean(connection.backendId))
));

const queuedConnections = computed(() => (
  chatCompletionConnections.value.filter((connection) => connection.phase === "queued" && !connection.backendId)
));

function openSummaryDrilldown(card: SummaryCard, segmentIndex: number): void {
  const segment = card.segments?.[segmentIndex];
  if (!segment?.drilldown) {
    return;
  }

  const targetPath = resolveDashboardPagePath(segment.drilldown.page);
  const targetHash = segment.drilldown.hash ?? "";
  const currentRoute = router.currentRoute.value;
  const currentPage = resolveDashboardPage(
    currentRoute.path,
    store.state.snapshot.backends.length > 0,
  );
  if (currentPage === segment.drilldown.page && currentRoute.hash === targetHash) {
    if (targetHash) {
      const targetElement = document.querySelector(targetHash);
      if (targetElement instanceof HTMLElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    return;
  }

  void router.push({
    path: targetPath,
    hash: targetHash,
    query: segment.drilldown.query,
  });
}
</script>

<template>
  <section class="page-section">
    <div class="summary-grid">
      <article
        v-for="card in store.summaryCards"
        :key="card.key"
        :class="['summary-card', `summary-card-${card.key}`, card.tone ?? 'neutral']"
        :title="card.title"
      >
        <div class="card-label">{{ card.label }}</div>
        <div v-if="card.segments?.length" class="card-value card-value-segments">
          <template v-for="(segment, index) in card.segments" :key="`${card.key}-segment-${index}`">
            <span
              v-if="index > 0"
              class="card-value-divider"
              aria-hidden="true"
            ></span>
            <span
              :class="[
                'card-value-segment',
                segment.tone ? `tone-${segment.tone}` : '',
                segment.drilldown ? 'card-value-segment-clickable' : '',
              ]"
            >
              <button
                v-if="segment.drilldown"
                type="button"
                class="card-value-segment-button"
                :title="segment.title || card.title"
                @click="openSummaryDrilldown(card, index)"
              >
                <span class="card-value-segment-number">{{ segment.text }}</span>
                <span v-if="segment.label" class="card-value-segment-label">{{ segment.label }}</span>
              </button>
              <template v-else>
                <span
                  class="card-value-segment-number"
                  :title="segment.title || card.title"
                >
                  {{ segment.text }}
                </span>
                <span
                  v-if="segment.label"
                  class="card-value-segment-label"
                  :title="segment.title || card.title"
                >
                  {{ segment.label }}
                </span>
              </template>
            </span>
          </template>
        </div>
        <div v-else class="card-value">{{ card.value }}</div>
        <div v-if="card.note" class="card-note">{{ card.note }}</div>
      </article>
    </div>

    <div id="backend-runtime" class="panel">
      <BackendTable
        :backends="store.state.snapshot.backends"
        :active-connections="store.state.snapshot.activeConnections"
        :recent-requests="store.state.snapshot.recentRequests"
        :recent-request-limit="store.state.snapshot.recentRequestLimit"
        mode="runtime"
      />
    </div>

    <div class="panel">
      <ConnectionPanel
        panel-id="active-connections"
        title="Connections"
        empty-text="No active connections are running right now."
        :connections="activeConnections"
        embedded
      />

      <ConnectionPanel
        panel-id="queued-connections"
        title="Queued"
        empty-text="No requests are waiting in the queue right now."
        :connections="queuedConnections"
        embedded
      />
    </div>
  </section>
</template>
