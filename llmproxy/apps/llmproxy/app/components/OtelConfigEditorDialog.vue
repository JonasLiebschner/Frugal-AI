<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import DialogCloseButton from "./DialogCloseButton.vue";
import { useDialogEscape } from "../composables/useDialogEscape";
import { getDefaultManagedConfigPath, getManagedConfigPath } from "../../../config/config-client";
import { getJsonSchemaFieldLabel, getJsonSchemaFieldMetaMap } from "../../../json-schema/json-schema-client";
import type { ConfigSchemaDocument, EditableOtelConfig, OtelEditorState } from "../types/dashboard";

const OTEL_FIELD_SCHEMA_PATHS = {
  enabled: ["enabled"],
  endpoint: ["endpoint"],
  headers: ["headers"],
  timeoutMs: ["timeoutMs"],
  serviceName: ["serviceName"],
  serviceNamespace: ["serviceNamespace"],
  deploymentEnvironment: ["deploymentEnvironment"],
  captureMessageContent: ["captureMessageContent"],
  captureToolContent: ["captureToolContent"],
} as const;

const props = defineProps<{
  state: OtelEditorState;
  currentConfig?: EditableOtelConfig | null;
  configSchema?: ConfigSchemaDocument | null;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "save", fields: {
    enabled: boolean;
    endpoint: string;
    headersText: string;
    clearHeaders: boolean;
    timeoutMs: string;
    serviceName: string;
    serviceNamespace: string;
    deploymentEnvironment: string;
    captureMessageContent: boolean;
    captureToolContent: boolean;
  }): void;
}>();

const draftFields = reactive({
  enabled: false,
  endpoint: "",
  headersText: "",
  clearHeaders: false,
  timeoutMs: "",
  serviceName: "",
  serviceNamespace: "",
  deploymentEnvironment: "",
  captureMessageContent: false,
  captureToolContent: false,
});

const managedConfigPath = getManagedConfigPath("otel");
const defaultManagedConfigPath = getDefaultManagedConfigPath("otel");
const fieldMeta = computed(() => getJsonSchemaFieldMetaMap(props.configSchema, OTEL_FIELD_SCHEMA_PATHS));
const fieldLabel = {
  enabled: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.enabled, "Enabled")),
  endpoint: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.endpoint, "OTLP endpoint")),
  headers: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.headers, "OTLP headers")),
  timeoutMs: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.timeoutMs, "Export timeout (ms)")),
  serviceName: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.serviceName, "Service name")),
  serviceNamespace: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.serviceNamespace, "Service namespace")),
  deploymentEnvironment: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.deploymentEnvironment, "Deployment environment")),
  captureMessageContent: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.captureMessageContent, "Capture message content")),
  captureToolContent: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.captureToolContent, "Capture tool content")),
};

function assignDraftFields(): void {
  draftFields.enabled = props.state.fields.enabled;
  draftFields.endpoint = props.state.fields.endpoint;
  draftFields.headersText = props.state.fields.headersText;
  draftFields.clearHeaders = props.state.fields.clearHeaders;
  draftFields.timeoutMs = props.state.fields.timeoutMs;
  draftFields.serviceName = props.state.fields.serviceName;
  draftFields.serviceNamespace = props.state.fields.serviceNamespace;
  draftFields.deploymentEnvironment = props.state.fields.deploymentEnvironment;
  draftFields.captureMessageContent = props.state.fields.captureMessageContent;
  draftFields.captureToolContent = props.state.fields.captureToolContent;
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
    enabled: draftFields.enabled,
    endpoint: String(draftFields.endpoint ?? ""),
    headersText: String(draftFields.headersText ?? ""),
    clearHeaders: draftFields.clearHeaders,
    timeoutMs: String(draftFields.timeoutMs ?? ""),
    serviceName: String(draftFields.serviceName ?? ""),
    serviceNamespace: String(draftFields.serviceNamespace ?? ""),
    deploymentEnvironment: String(draftFields.deploymentEnvironment ?? ""),
    captureMessageContent: draftFields.captureMessageContent,
    captureToolContent: draftFields.captureToolContent,
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
      <div class="request-detail-dialog server-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="otel-editor-title">
        <div class="panel-header">
          <div>
            <h2 id="otel-editor-title" class="panel-title">Edit OpenTelemetry exporter</h2>
            <p class="hint">
              Changes are written to <span class="mono">{{ managedConfigPath }}</span>.
              Locally, that defaults to <span class="mono">{{ defaultManagedConfigPath }}</span>.
              Exporter settings apply immediately.
            </p>
          </div>
          <DialogCloseButton :disabled="state.saving" @click="closeDialog" />
        </div>

        <section class="request-detail-card">
          <div class="detail-card-viewport">
            <div class="field-grid backend-form-grid">
              <label class="field checkbox-field field-span-2">
                <input
                  v-model="draftFields.enabled"
                  type="checkbox"
                  :disabled="fieldMeta.enabled?.readOnly ?? false"
                />
                <span>{{ fieldLabel.enabled }}</span>
              </label>

              <label class="field field-span-2">
                <span class="field-label">{{ fieldLabel.endpoint }}</span>
                <input
                  v-model="draftFields.endpoint"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="https://collector.example.com/v1/traces"
                  :readonly="fieldMeta.endpoint?.readOnly ?? false"
                  :disabled="fieldMeta.endpoint?.readOnly ?? false"
                  :title="fieldMeta.endpoint?.description"
                />
                <span v-if="fieldMeta.endpoint?.description" class="hint">{{ fieldMeta.endpoint.description }}</span>
                <span v-if="fieldMeta.endpoint?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>

              <label class="field">
                <span class="field-label">{{ fieldLabel.timeoutMs }}</span>
                <input
                  v-model="draftFields.timeoutMs"
                  type="number"
                  min="1"
                  step="1"
                  inputmode="numeric"
                  :readonly="fieldMeta.timeoutMs?.readOnly ?? false"
                  :disabled="fieldMeta.timeoutMs?.readOnly ?? false"
                  :title="fieldMeta.timeoutMs?.description"
                />
                <span v-if="fieldMeta.timeoutMs?.description" class="hint">{{ fieldMeta.timeoutMs.description }}</span>
                <span v-if="fieldMeta.timeoutMs?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>

              <label class="field">
                <span class="field-label">{{ fieldLabel.serviceName }}</span>
                <input
                  v-model="draftFields.serviceName"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="llmproxy"
                  :readonly="fieldMeta.serviceName?.readOnly ?? false"
                  :disabled="fieldMeta.serviceName?.readOnly ?? false"
                  :title="fieldMeta.serviceName?.description"
                />
                <span v-if="fieldMeta.serviceName?.description" class="hint">{{ fieldMeta.serviceName.description }}</span>
                <span v-if="fieldMeta.serviceName?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>

              <label class="field">
                <span class="field-label">{{ fieldLabel.serviceNamespace }}</span>
                <input
                  v-model="draftFields.serviceNamespace"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="production"
                  :readonly="fieldMeta.serviceNamespace?.readOnly ?? false"
                  :disabled="fieldMeta.serviceNamespace?.readOnly ?? false"
                  :title="fieldMeta.serviceNamespace?.description"
                />
                <span v-if="fieldMeta.serviceNamespace?.description" class="hint">{{ fieldMeta.serviceNamespace.description }}</span>
                <span v-if="fieldMeta.serviceNamespace?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>

              <label class="field field-span-2">
                <span class="field-label">{{ fieldLabel.deploymentEnvironment }}</span>
                <input
                  v-model="draftFields.deploymentEnvironment"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="production"
                  :readonly="fieldMeta.deploymentEnvironment?.readOnly ?? false"
                  :disabled="fieldMeta.deploymentEnvironment?.readOnly ?? false"
                  :title="fieldMeta.deploymentEnvironment?.description"
                />
                <span v-if="fieldMeta.deploymentEnvironment?.description" class="hint">{{ fieldMeta.deploymentEnvironment.description }}</span>
                <span v-if="fieldMeta.deploymentEnvironment?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>

              <label class="field field-span-2">
                <span class="field-label">{{ fieldLabel.headers }}</span>
                <textarea
                  v-model="draftFields.headersText"
                  rows="5"
                  spellcheck="false"
                  placeholder="{&#10;  &quot;authorization&quot;: &quot;Bearer &lt;token&gt;&quot;&#10;}"
                  :readonly="fieldMeta.headers?.readOnly ?? false"
                  :disabled="fieldMeta.headers?.readOnly ?? false"
                  :title="fieldMeta.headers?.description"
                />
                <span v-if="fieldMeta.headers?.description" class="hint">{{ fieldMeta.headers.description }}</span>
                <span v-if="fieldMeta.headers?.writeOnly" class="hint">This field is write-only. Stored values are never returned by the API.</span>
                <span
                  v-if="currentConfig?.headersConfigured && !draftFields.headersText.trim() && !draftFields.clearHeaders"
                  class="hint"
                >
                  Headers are currently configured and hidden. Enter new JSON to replace them or enable the clear option below.
                </span>
                <span v-if="fieldMeta.headers?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>

              <label class="field checkbox-field field-span-2">
                <input
                  v-model="draftFields.clearHeaders"
                  type="checkbox"
                  :disabled="fieldMeta.headers?.readOnly ?? false"
                />
                <span>Clear stored OTLP headers</span>
              </label>

              <label class="field checkbox-field field-span-2">
                <input
                  v-model="draftFields.captureMessageContent"
                  type="checkbox"
                  :disabled="fieldMeta.captureMessageContent?.readOnly ?? false"
                />
                <span>{{ fieldLabel.captureMessageContent }}</span>
              </label>
              <span v-if="fieldMeta.captureMessageContent?.description" class="hint field-span-2">{{ fieldMeta.captureMessageContent.description }}</span>
              <span v-if="fieldMeta.captureMessageContent?.readOnly" class="hint field-span-2">This field is marked read-only by the app schema.</span>

              <label class="field checkbox-field field-span-2">
                <input
                  v-model="draftFields.captureToolContent"
                  type="checkbox"
                  :disabled="fieldMeta.captureToolContent?.readOnly ?? false"
                />
                <span>{{ fieldLabel.captureToolContent }}</span>
              </label>
              <span v-if="fieldMeta.captureToolContent?.description" class="hint field-span-2">{{ fieldMeta.captureToolContent.description }}</span>
              <span v-if="fieldMeta.captureToolContent?.readOnly" class="hint field-span-2">This field is marked read-only by the app schema.</span>
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
