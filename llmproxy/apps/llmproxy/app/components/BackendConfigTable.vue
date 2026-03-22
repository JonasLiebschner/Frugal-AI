<script setup lang="ts">
import { ref } from "vue";
import ModelInfoDialog from "./ModelInfoDialog.vue";
import type { BackendSnapshot, ModelDetailView } from "../types/dashboard";
import {
  backendStateClass,
  backendStateTitle,
  connectorLabel,
  modelSpecs,
} from "../utils/backend-table";

const props = defineProps<{
  backends: BackendSnapshot[];
}>();

const emit = defineEmits<{
  (event: "edit-backend", backendId: string): void;
  (event: "delete-backend", backendId: string): void;
}>();

const selectedModelDetail = ref<ModelDetailView | null>(null);

function openModelDetail(detail: ModelDetailView | undefined): void {
  if (!detail) {
    return;
  }

  selectedModelDetail.value = detail;
}
</script>

<template>
  <div class="table-wrap">
    <table class="backend-table backend-table-config">
      <colgroup>
        <col class="backend-col-name">
        <col class="backend-col-type">
        <col class="backend-col-max-concurrency">
        <col class="backend-col-models">
        <col class="backend-col-action">
      </colgroup>
      <thead>
        <tr>
          <th>Connection</th>
          <th class="backend-type-cell">Type</th>
          <th class="backend-number-cell backend-max-concurrency-cell">
            <span class="backend-max-concurrency-content">Max concurrency</span>
          </th>
          <th class="backend-models-cell">Effective models</th>
          <th class="backend-action-cell">Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="backend in props.backends" :key="backend.id">
          <td class="backend-name-cell">
            <div class="backend-name-content">
              <div class="table-name">
                <span
                  :class="['backend-health-dot', backendStateClass(backend)]"
                  :title="backendStateTitle(backend)"
                  aria-hidden="true"
                ></span>
                <span>{{ backend.name }}</span>
              </div>
              <div class="table-sub backend-identity">
                <span class="backend-url">{{ backend.baseUrl }}</span>
              </div>
            </div>
          </td>
          <td class="backend-type-cell">
            <div class="backend-type-content">
              <div class="log-primary">{{ connectorLabel(backend.connector) }}</div>
            </div>
          </td>
          <td class="backend-number-cell backend-max-concurrency-cell">
            <div class="backend-max-concurrency-content">
              <div class="log-primary" title="Configured maximum number of concurrent requests for this connection.">
                {{ backend.maxConcurrency }}
              </div>
            </div>
          </td>
          <td class="backend-models-cell">
            <div class="backend-models-content models">
              <template v-for="spec in modelSpecs(backend)" :key="spec.text + spec.className">
                <button
                  v-if="spec.detail"
                  type="button"
                  :class="[spec.className, 'model-chip-button']"
                  @click="openModelDetail(spec.detail)"
                >
                  <span>{{ spec.text }}</span>
                  <span class="model-chip-link" aria-hidden="true">&nearr;</span>
                </button>
                <span
                  v-else
                  :class="spec.className"
                >
                  {{ spec.text }}
                </span>
              </template>
            </div>
          </td>
          <td class="backend-action-cell">
            <div class="backend-action-content">
              <button
                class="icon-button compact danger"
                type="button"
                title="Delete connection configuration"
                aria-label="Delete connection configuration"
                @click="emit('delete-backend', backend.id)"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 7h16"></path>
                  <path d="M9 7V5.75C9 4.78 9.78 4 10.75 4h2.5C14.22 4 15 4.78 15 5.75V7"></path>
                  <path d="M6 7l1 12a2 2 0 0 0 1.99 1.83h6.02A2 2 0 0 0 17 19l1-12"></path>
                  <path d="M10 11v6"></path>
                  <path d="M14 11v6"></path>
                </svg>
              </button>
              <button
                class="icon-button compact"
                type="button"
                title="Edit connection configuration"
                aria-label="Edit connection configuration"
                @click="emit('edit-backend', backend.id)"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <ModelInfoDialog :detail="selectedModelDetail" @close="selectedModelDetail = null" />
</template>
