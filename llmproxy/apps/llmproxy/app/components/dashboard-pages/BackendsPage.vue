<script setup lang="ts">
import { computed } from "vue";
import BackendEditorDialog from "../BackendEditorDialog.vue";
import ConfigConnectionsTab from "../dashboard-config/ConfigConnectionsTab.vue";
import ConfigGeneralTab from "../dashboard-config/ConfigGeneralTab.vue";
import ConfigMcpTab from "../dashboard-config/ConfigMcpTab.vue";
import ConfigOpenAiTab from "../dashboard-config/ConfigOpenAiTab.vue";
import { useDashboardStore } from "../../composables/useDashboardStore";
import {
  dashboardConfigTabs,
  resolveDashboardConfigTabPath,
} from "../../../llmproxy-client";
import type { DashboardConfigTab } from "../../../llmproxy-client";

const store = useDashboardStore();
const props = defineProps<{
  tab: DashboardConfigTab;
}>();

const activeTab = computed(() => props.tab);
const configTabs = dashboardConfigTabs;
const currentConnectionConfig = computed(() => {
  const backendId = store.state.backendEditor.originalId;
  return backendId ? store.state.backendConfigs[backendId] ?? null : null;
});
</script>

<template>
  <section class="page-section">
    <div class="panel">
      <div class="panel-header config-panel-header">
        <div class="request-detail-tab-bar config-tab-bar">
          <NuxtLink
            v-for="tab in configTabs"
            :key="tab.key"
            :class="['request-detail-tab-button', activeTab === tab.key ? 'active' : '']"
            :to="resolveDashboardConfigTabPath(tab.key)"
          >
            {{ tab.label }}
          </NuxtLink>
        </div>
      </div>
      <div v-if="store.state.serverEditor.notice" :class="['mb-4', 'config-notice', store.state.serverEditor.noticeTone]">
        {{ store.state.serverEditor.notice }}
      </div>
      <div v-if="store.state.otelEditor.notice" :class="['mb-4', 'config-notice', store.state.otelEditor.noticeTone]">
        {{ store.state.otelEditor.notice }}
      </div>
      <ConfigGeneralTab v-if="activeTab === 'general'" />
      <ConfigOpenAiTab v-else-if="activeTab === 'openai'" />
      <ConfigMcpTab v-else-if="activeTab === 'mcp'" />
      <ConfigConnectionsTab v-else />
    </div>
    <BackendEditorDialog
      :state="store.state.backendEditor"
      :current-config="currentConnectionConfig"
      :config-schema="store.state.configSchemas['ai-client']"
      @close="store.closeBackendEditor"
      @save="store.saveBackendEditor"
    />
  </section>
</template>
