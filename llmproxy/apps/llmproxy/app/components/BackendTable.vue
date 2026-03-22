<script setup lang="ts">
import BackendConfigTable from "./BackendConfigTable.vue";
import BackendRuntimeTable from "./BackendRuntimeTable.vue";
import type {
  ActiveConnectionSnapshot,
  BackendSnapshot,
  RequestLogEntry,
} from "../types/dashboard";

const props = withDefaults(defineProps<{
  backends: BackendSnapshot[];
  activeConnections?: ActiveConnectionSnapshot[];
  recentRequests?: RequestLogEntry[];
  recentRequestLimit?: number;
  mode?: "runtime" | "config";
}>(), {
  mode: "runtime",
  activeConnections: () => [],
  recentRequests: () => [],
  recentRequestLimit: 0,
});

const emit = defineEmits<{
  (event: "edit-backend", backendId: string): void;
  (event: "delete-backend", backendId: string): void;
}>();
</script>

<template>
  <BackendRuntimeTable
    v-if="props.mode === 'runtime'"
    :backends="props.backends"
    :active-connections="props.activeConnections"
    :recent-requests="props.recentRequests"
    :recent-request-limit="props.recentRequestLimit"
  />
  <BackendConfigTable
    v-else
    :backends="props.backends"
    @edit-backend="emit('edit-backend', $event)"
    @delete-backend="emit('delete-backend', $event)"
  />
</template>
