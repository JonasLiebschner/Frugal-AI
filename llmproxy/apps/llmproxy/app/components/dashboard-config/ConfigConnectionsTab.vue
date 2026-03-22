<script setup lang="ts">
import { computed } from "vue";
import { getConfigViewBackends } from "../../../llmproxy-client";
import { useDashboardStore } from "../../composables/useDashboardStore";
import BackendTable from "../BackendTable.vue";

const store = useDashboardStore();

const configViewBackends = computed(() => getConfigViewBackends(
  store.state.snapshot.backends,
  store.state.backendConfigs,
));
</script>

<template>
  <div class="config-tab-panel">
    <div class="panel-header config-section-head">
      <button
        class="icon-button compact"
        type="button"
        title="Add connection configuration"
        aria-label="Add connection configuration"
        @click="store.openCreateBackend"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14"></path>
          <path d="M5 12h14"></path>
        </svg>
      </button>
    </div>
    <BackendTable
      v-if="!store.state.backendEditor.open"
      :backends="configViewBackends"
      mode="config"
      @edit-backend="store.openEditBackend"
      @delete-backend="store.deleteBackendById"
    />
  </div>
</template>
