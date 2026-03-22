<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import DialogCloseButton from "./DialogCloseButton.vue";
import { useDialogEscape } from "../composables/useDialogEscape";
import { getDefaultManagedConfigPath, getManagedConfigPath } from "../../../config/config-client";
import { getJsonSchemaFieldLabel, getJsonSchemaFieldMetaMap } from "../../../json-schema/json-schema-client";
import type { ConfigSchemaDocument, EditableAiClientSettings, ServerEditorState } from "../types/dashboard";

const SERVER_FIELD_SCHEMA_PATHS = {
  requestTimeoutMs: ["requestTimeoutMs"],
  queueTimeoutMs: ["queueTimeoutMs"],
  healthCheckIntervalMs: ["healthCheckIntervalMs"],
  recentRequestLimit: ["recentRequestLimit"],
} as const;

const props = defineProps<{
  state: ServerEditorState;
  currentConfig?: EditableAiClientSettings | null;
  configSchema?: ConfigSchemaDocument | null;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "save", fields: {
    requestTimeoutMs: string;
    queueTimeoutMs: string;
    healthCheckIntervalMs: string;
    recentRequestLimit: string;
  }): void;
}>();

const noticeClass = computed(() => {
  if (props.state.noticeTone === "good") {
    return "config-notice good";
  }

  if (props.state.noticeTone === "warn") {
    return "config-notice warn";
  }

  return "config-notice";
});

const draftFields = reactive({
  requestTimeoutMs: "",
  queueTimeoutMs: "",
  healthCheckIntervalMs: "",
  recentRequestLimit: "",
});

const managedConfigPath = getManagedConfigPath("ai-client");
const defaultManagedConfigPath = getDefaultManagedConfigPath("ai-client");
const fieldMeta = computed(() => getJsonSchemaFieldMetaMap(props.configSchema, SERVER_FIELD_SCHEMA_PATHS));
const fieldLabel = {
  requestTimeoutMs: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.requestTimeoutMs, "Request timeout (ms)")),
  queueTimeoutMs: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.queueTimeoutMs, "Queue timeout (ms)")),
  healthCheckIntervalMs: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.healthCheckIntervalMs, "Health check interval (ms)")),
  recentRequestLimit: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.recentRequestLimit, "Recent request limit")),
};

function assignDraftFields(): void {
  draftFields.requestTimeoutMs = props.state.fields.requestTimeoutMs;
  draftFields.queueTimeoutMs = props.state.fields.queueTimeoutMs;
  draftFields.healthCheckIntervalMs = props.state.fields.healthCheckIntervalMs;
  draftFields.recentRequestLimit = props.state.fields.recentRequestLimit;
}

watch(
  () => props.state.open,
  (open) => {
    if (open) {
      assignDraftFields();
    }
  },
  { immediate: true },
);

function closeDialog(): void {
  if (props.state.saving) {
    return;
  }

  emit("close");
}

function submitDialog(): void {
  emit("save", {
    requestTimeoutMs: String(draftFields.requestTimeoutMs ?? ""),
    queueTimeoutMs: String(draftFields.queueTimeoutMs ?? ""),
    healthCheckIntervalMs: String(draftFields.healthCheckIntervalMs ?? ""),
    recentRequestLimit: String(draftFields.recentRequestLimit ?? ""),
  });
}

useDialogEscape(
  () => props.state.open,
  closeDialog,
);

</script>

<template>
  <Teleport to="body">
    <div
      v-if="state.open"
      class="request-detail-overlay server-editor-overlay"
      @click.self="closeDialog"
    >
      <div class="request-detail-dialog server-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="server-editor-title">
        <div class="panel-header">
          <div>
            <h2 id="server-editor-title" class="panel-title">Edit AI client config</h2>
            <p class="hint">
              Changes are written to <span class="mono">{{ managedConfigPath }}</span>.
              Locally, that defaults to <span class="mono">{{ defaultManagedConfigPath }}</span>.
              Runtime settings apply immediately.
            </p>
          </div>
          <DialogCloseButton :disabled="state.saving" @click="closeDialog" />
        </div>

        <section class="request-detail-card">
          <div class="detail-card-viewport">
            <div class="field-grid backend-form-grid">
              <label class="field">
                <span class="field-label">{{ fieldLabel.requestTimeoutMs }}</span>
                <input
                  v-model="draftFields.requestTimeoutMs"
                  type="number"
                  min="1"
                  step="1"
                  inputmode="numeric"
                  :readonly="fieldMeta.requestTimeoutMs?.readOnly ?? false"
                  :disabled="fieldMeta.requestTimeoutMs?.readOnly ?? false"
                  :title="fieldMeta.requestTimeoutMs?.description"
                />
                <span v-if="fieldMeta.requestTimeoutMs?.description" class="hint">{{ fieldMeta.requestTimeoutMs.description }}</span>
                <span v-if="fieldMeta.requestTimeoutMs?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>

              <label class="field">
                <span class="field-label">{{ fieldLabel.queueTimeoutMs }}</span>
                <input
                  v-model="draftFields.queueTimeoutMs"
                  type="number"
                  min="1"
                  step="1"
                  inputmode="numeric"
                  :readonly="fieldMeta.queueTimeoutMs?.readOnly ?? false"
                  :disabled="fieldMeta.queueTimeoutMs?.readOnly ?? false"
                  :title="fieldMeta.queueTimeoutMs?.description"
                />
                <span v-if="fieldMeta.queueTimeoutMs?.description" class="hint">{{ fieldMeta.queueTimeoutMs.description }}</span>
                <span v-if="fieldMeta.queueTimeoutMs?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>

              <label class="field">
                <span class="field-label">{{ fieldLabel.healthCheckIntervalMs }}</span>
                <input
                  v-model="draftFields.healthCheckIntervalMs"
                  type="number"
                  min="1"
                  step="1"
                  inputmode="numeric"
                  :readonly="fieldMeta.healthCheckIntervalMs?.readOnly ?? false"
                  :disabled="fieldMeta.healthCheckIntervalMs?.readOnly ?? false"
                  :title="fieldMeta.healthCheckIntervalMs?.description"
                />
                <span v-if="fieldMeta.healthCheckIntervalMs?.description" class="hint">{{ fieldMeta.healthCheckIntervalMs.description }}</span>
                <span v-if="fieldMeta.healthCheckIntervalMs?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>

              <label class="field">
                <span class="field-label">{{ fieldLabel.recentRequestLimit }}</span>
                <input
                  v-model="draftFields.recentRequestLimit"
                  type="number"
                  min="1"
                  step="1"
                  inputmode="numeric"
                  :readonly="fieldMeta.recentRequestLimit?.readOnly ?? false"
                  :disabled="fieldMeta.recentRequestLimit?.readOnly ?? false"
                  :title="fieldMeta.recentRequestLimit?.description"
                />
                <span v-if="fieldMeta.recentRequestLimit?.description" class="hint">{{ fieldMeta.recentRequestLimit.description }}</span>
                <span v-if="fieldMeta.recentRequestLimit?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>
            </div>
          </div>
        </section>

        <div class="backend-editor-actions">
          <div class="toggle-row">
            <button class="button" type="button" :disabled="state.saving || state.loading" @click="submitDialog">
              {{ state.saving ? "Saving..." : "Save changes" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
