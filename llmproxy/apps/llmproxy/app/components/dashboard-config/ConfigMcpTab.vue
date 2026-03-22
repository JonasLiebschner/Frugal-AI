<script setup lang="ts">
import { computed, watch } from "vue";
import { buildMcpServicesForDocs } from "../../../llmproxy-client";
import { useDiagnosticsCapabilities } from "../../composables/useDiagnosticsCapabilities";
import ToolDefinitionsView from "../ToolDefinitionsView.vue";

const {
  endpointUrl,
  loadCapabilities,
  loadingCapabilities,
  mcpServerEnabled,
  serviceDefinitions,
} = useDiagnosticsCapabilities();

const mcpServicesForDocs = computed(() => buildMcpServicesForDocs(serviceDefinitions.value));

watch(
  mcpServerEnabled,
  (enabled) => {
    if (enabled !== false) {
      void loadCapabilities();
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="config-tab-panel">
    <div
      class="mcp-endpoint-card"
      title="Canonical JSON-RPC MCP endpoint exposed by llmproxy."
    >
      <div class="mcp-endpoint-label">Endpoint</div>
      <div class="mcp-endpoint-value mono">{{ endpointUrl }}</div>
    </div>
    <div class="diagnostics-tools">
      <div class="diagnostics-section-label">Available llmproxy functions</div>
      <div class="diagnostics-tools-list">
        <template v-if="mcpServicesForDocs.length">
          <article
            v-for="service in mcpServicesForDocs"
            :key="service.id"
            class="mcp-service-card"
          >
            <div class="mcp-service-head">
              <h3 class="mcp-service-title">{{ service.title }}</h3>
              <p class="mcp-service-description">{{ service.description }}</p>
            </div>

            <div v-if="service.toolsForRenderer.length" class="mcp-service-section">
              <div class="diagnostics-section-label">Tools</div>
              <ToolDefinitionsView :tools="service.toolsForRenderer" />
            </div>
          </article>
        </template>
        <div v-else-if="mcpServerEnabled === false" class="empty">
          MCP server is disabled.
        </div>
        <div v-else class="empty">
          {{ loadingCapabilities ? "Loading llmproxy functions..." : "No llmproxy function metadata loaded yet." }}
        </div>
      </div>
    </div>
  </div>
</template>
