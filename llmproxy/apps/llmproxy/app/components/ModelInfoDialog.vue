<script setup lang="ts">
import { ref, watch } from "vue";
import DialogCloseButton from "./DialogCloseButton.vue";
import { useDialogEscape } from "../composables/useDialogEscape";
import type { ModelDetailView } from "../types/dashboard";

const props = defineProps<{
  detail: ModelDetailView | null;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();

type ModelInfoTab = "overview" | "raw-metadata";

const activeTab = ref<ModelInfoTab>("overview");
const rawMetadataViewer = ref<{ resize: () => void } | null>(null);
const { scheduleResize: resizeRawMetadataViewer } = useCodeViewerResize(rawMetadataViewer);

watch(
  () => props.detail,
  () => {
    activeTab.value = "overview";
  },
);

watch(
  activeTab,
  (tab) => {
    if (tab !== "raw-metadata") {
      return;
    }

    void resizeRawMetadataViewer();
  },
  { flush: "post" },
);

useDialogEscape(
  () => props.detail !== null,
  () => emit("close"),
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="detail"
      class="request-detail-overlay"
      @click.self="emit('close')"
    >
      <div class="request-detail-dialog model-info-dialog" role="dialog" aria-modal="true" aria-labelledby="model-info-title">
        <div class="panel-header">
          <div>
            <h2 id="model-info-title" class="panel-title">{{ detail.title }}</h2>
          </div>
          <DialogCloseButton
            compact
            title="Close model details"
            aria-label="Close model details"
            @click="emit('close')"
          />
        </div>

        <div class="request-detail-card request-detail-inspector-card model-info-panel">
          <div class="request-detail-tab-bar" role="tablist" aria-label="Model detail sections">
            <button
              type="button"
              class="request-detail-tab-button"
              :class="{ active: activeTab === 'overview' }"
              role="tab"
              :aria-selected="activeTab === 'overview'"
              @click="activeTab = 'overview'"
            >
              <span>Overview</span>
            </button>
            <button
              type="button"
              class="request-detail-tab-button"
              :class="{ active: activeTab === 'raw-metadata' }"
              role="tab"
              :aria-selected="activeTab === 'raw-metadata'"
              @click="activeTab = 'raw-metadata'"
            >
              <span>Raw Metadata</span>
            </button>
          </div>

          <div v-if="activeTab === 'overview'" class="detail-card-viewport model-info-overview-viewport">
            <section class="request-detail-section">
              <h3>Overview</h3>
              <div class="model-detail-grid">
                <article
                  v-for="field in detail.summary"
                  :key="field.label + field.value"
                  class="model-detail-card"
                >
                  <div class="model-detail-label">{{ field.label }}</div>
                  <div class="model-detail-value">{{ field.value }}</div>
                </article>
              </div>
            </section>

            <section
              v-for="section in detail.sections"
              :key="section.title"
              class="request-detail-section"
            >
              <h3>{{ section.title }}</h3>
              <div class="model-field-list">
                <div
                  v-for="field in section.fields"
                  :key="section.title + field.label + field.value"
                  class="model-field-row"
                >
                  <div class="model-field-label">{{ field.label }}</div>
                  <div class="model-field-value">{{ field.value }}</div>
                </div>
              </div>
            </section>
          </div>

          <div v-else class="detail-card-viewport model-info-metadata-viewport">
            <section class="request-detail-section model-info-metadata-section">
              <CodeViewer
                ref="rawMetadataViewer"
                :value="detail.rawMetadata"
                placeholder="No raw model metadata was stored."
                min-height="clamp(320px, 52vh, 560px)"
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
