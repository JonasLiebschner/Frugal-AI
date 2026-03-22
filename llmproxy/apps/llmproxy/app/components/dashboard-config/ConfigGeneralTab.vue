<script setup lang="ts">
import { computed } from "vue";
import {
  buildAiRequestMiddlewareRows,
  buildOtelConfigRows,
  buildServerConfigRows,
} from "../../../llmproxy-client";
import { useDashboardStore } from "../../composables/useDashboardStore";

const store = useDashboardStore();

const configLoadMessage = computed(() => (
  store.state.backendEditor.error || "Loading AI client config..."
));
const otelLoadMessage = computed(() => (
  store.state.otelEditor.error || "Loading OpenTelemetry exporter config..."
));
const aiRequestMiddlewareLoadMessage = computed(() => (
  store.state.aiRequestMiddlewareEditor.error || "Loading AI request middleware config..."
));

const serverConfigRows = computed(() => buildServerConfigRows(
  store.state.serverConfig,
  store.state.mcpEnabled,
));

const otelConfigRows = computed(() => buildOtelConfigRows(store.state.otelConfig));

const aiRequestMiddlewareRows = computed(() => buildAiRequestMiddlewareRows(store.state.aiRequestMiddlewares));
</script>

<template>
  <div class="config-tab-panel">
    <div class="diagnostics-tools">
      <div class="panel-header config-section-head">
        <div class="diagnostics-section-label">AI client settings</div>
        <button
          class="icon-button compact"
          type="button"
          title="Edit AI client config"
          aria-label="Edit AI client config"
          @click="store.openServerEditor"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"></path>
          </svg>
        </button>
      </div>
      <div v-if="serverConfigRows.length" class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in serverConfigRows" :key="row.key">
              <td :title="row.title" class="detail-table-key">{{ row.key }}</td>
              <td :title="row.title" class="detail-table-value mono">{{ row.value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty">{{ configLoadMessage }}</div>
    </div>

    <div class="diagnostics-tools">
      <div class="panel-header config-section-head">
        <div class="diagnostics-section-label">OpenTelemetry exporter</div>
        <button
          class="icon-button compact"
          type="button"
          title="Edit OpenTelemetry exporter"
          aria-label="Edit OpenTelemetry exporter"
          @click="store.openOtelEditor"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"></path>
          </svg>
        </button>
      </div>
      <div v-if="otelConfigRows.length" class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in otelConfigRows" :key="row.key">
              <td :title="row.title" class="detail-table-key">{{ row.key }}</td>
              <td :title="row.title" class="detail-table-value mono">{{ row.value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty">{{ otelLoadMessage }}</div>
    </div>

    <div class="diagnostics-tools">
      <div class="panel-header config-section-head">
        <div class="diagnostics-section-label">AI request routing middlewares</div>
        <button
          class="icon-button compact"
          type="button"
          title="Add AI request routing middleware"
          aria-label="Add AI request routing middleware"
          @click="store.openCreateAiRequestMiddleware"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14"></path>
            <path d="M5 12h14"></path>
          </svg>
        </button>
      </div>
      <p class="diagnostics-prompt-description">
        These routers are only used when a request explicitly sets
        <span class="mono">model</span> to
        <span class="mono">middleware:&lt;id&gt;</span>.
      </p>
      <div v-if="aiRequestMiddlewareRows.length" class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Middleware id</th>
              <th>URL</th>
              <th>Small model</th>
              <th>Large model</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in aiRequestMiddlewareRows" :key="row.id">
              <td class="detail-table-value mono">{{ row.order }}</td>
              <td class="detail-table-value mono">{{ row.id }}</td>
              <td class="detail-table-value mono">{{ row.url }}</td>
              <td class="detail-table-value mono">{{ row.smallModel }}</td>
              <td class="detail-table-value mono">{{ row.largeModel }}</td>
              <td class="detail-table-value">
                <div class="backend-action-content">
                  <button
                    class="icon-button compact"
                    type="button"
                    :title="`Edit middleware ${row.id}`"
                    :aria-label="`Edit middleware ${row.id}`"
                    @click="store.openEditAiRequestMiddleware(row.id)"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"></path>
                    </svg>
                  </button>
                  <button
                    class="icon-button compact danger"
                    type="button"
                    :title="`Delete middleware ${row.id}`"
                    :aria-label="`Delete middleware ${row.id}`"
                    @click="store.deleteAiRequestMiddlewareById(row.id)"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18"></path>
                      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"></path>
                      <path d="M6 6l1 14h10l1-14"></path>
                      <path d="M10 10v6"></path>
                      <path d="M14 10v6"></path>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty">
        {{
          store.state.aiRequestMiddlewareEditor.error
            || (store.state.aiRequestMiddlewareEditor.loading
              ? aiRequestMiddlewareLoadMessage
              : "No AI request routing middlewares configured yet."
            )
        }}
      </div>
    </div>
  </div>
</template>
