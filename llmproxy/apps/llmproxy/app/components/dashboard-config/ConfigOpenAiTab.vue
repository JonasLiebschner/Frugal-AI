<script setup lang="ts">
import { computed } from "vue";
import {
  buildOpenAiRouteRows,
  openAiCompatibilityNotes,
  openAiParameterSupportRows,
  openAiSupportLegend,
} from "../../../llmproxy-client";

const openAiBaseUrl = computed(() => (
  typeof window === "undefined" ? "" : window.location.origin
));
const openAiRouteRows = computed(() => buildOpenAiRouteRows(openAiBaseUrl.value));
</script>

<template>
  <div class="config-tab-panel">
    <div
      class="mcp-endpoint-card"
      title="Base URL for the OpenAI-compatible llmproxy API."
    >
      <div class="mcp-endpoint-label">Endpoint</div>
      <div class="mcp-endpoint-value mono">{{ openAiBaseUrl }}</div>
    </div>
    <div class="diagnostics-tools">
      <div class="diagnostics-section-label">Available routes</div>
      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>Route</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in openAiRouteRows" :key="row.route">
              <td :title="row.purpose" class="detail-table-value mono">{{ row.route }}</td>
              <td :title="row.purpose" class="detail-table-value">{{ row.purpose }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="diagnostics-tools">
      <div class="diagnostics-section-label">Connector behavior</div>
      <div class="mcp-prompt-grid">
        <article
          v-for="note in openAiCompatibilityNotes"
          :key="note.title"
          class="mcp-prompt-card"
        >
          <div class="mcp-prompt-title">{{ note.title }}</div>
          <div class="mcp-prompt-description">{{ note.description }}</div>
        </article>
      </div>
    </div>
    <div class="diagnostics-tools">
      <div class="diagnostics-section-label">Chat completion parameter support</div>
      <p class="diagnostics-prompt-description">
        This matrix documents how llmproxy handles the most important fields for
        <span class="mono">POST {{ openAiBaseUrl }}/v1/chat/completions</span>.
        Fields not listed here are forwarded unchanged for <span class="mono">openai</span> and
        <span class="mono">llama.cpp</span> connections, but are not connector-mapped for
        <span class="mono">ollama</span> unless they appear below.
      </p>
      <div class="mcp-prompt-grid">
        <article
          v-for="row in openAiSupportLegend"
          :key="row.state"
          class="mcp-prompt-card"
        >
          <div class="mcp-prompt-title mono">{{ row.state }}</div>
          <div class="mcp-prompt-description">{{ row.description }}</div>
        </article>
      </div>
      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>openai</th>
              <th>ollama</th>
              <th>llama.cpp</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in openAiParameterSupportRows" :key="row.parameter">
              <td :title="row.notes" class="detail-table-value mono">{{ row.parameter }}</td>
              <td :title="row.notes" class="detail-table-value mono">{{ row.openai }}</td>
              <td :title="row.notes" class="detail-table-value mono">{{ row.ollama }}</td>
              <td :title="row.notes" class="detail-table-value mono">{{ row.llamaCpp }}</td>
              <td :title="row.notes" class="detail-table-value">{{ row.notes }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
