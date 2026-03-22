<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import DialogCloseButton from "./DialogCloseButton.vue";
import { useDialogEscape } from "../composables/useDialogEscape";
import { getDefaultManagedConfigPath, getManagedConfigPath } from "../../../config/config-client";
import {
  getJsonSchemaFieldExampleText,
  getJsonSchemaFieldJsonExampleText,
  getJsonSchemaFieldLabel,
  getJsonSchemaFieldLineListExampleText,
  getJsonSchemaFieldMetaMap,
} from "../../../json-schema/json-schema-client";
import type { BackendEditorFields, BackendEditorState, ConfigSchemaDocument, EditableConnectionConfig } from "../types/dashboard";

const BACKEND_FIELD_SCHEMA_PATHS = {
  id: ["connections", "*", "id"],
  name: ["connections", "*", "name"],
  baseUrl: ["connections", "*", "baseUrl"],
  connector: ["connections", "*", "connector"],
  enabled: ["connections", "*", "enabled"],
  maxConcurrency: ["connections", "*", "maxConcurrency"],
  healthPath: ["connections", "*", "healthPath"],
  models: ["connections", "*", "models"],
  headers: ["connections", "*", "headers"],
  apiKeyEnv: ["connections", "*", "apiKeyEnv"],
  apiKey: ["connections", "*", "apiKey"],
  timeoutMs: ["connections", "*", "timeoutMs"],
  monitoringTimeoutMs: ["connections", "*", "monitoringTimeoutMs"],
  monitoringIntervalMs: ["connections", "*", "monitoringIntervalMs"],
  energyUsageUrl: ["connections", "*", "energyUsageUrl"],
} as const;

const props = defineProps<{
  state: BackendEditorState;
  currentConfig?: EditableConnectionConfig | null;
  configSchema?: ConfigSchemaDocument | null;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "save", fields: BackendEditorFields): void;
}>();

const title = computed(() => props.state.mode === "create" ? "Add connection" : "Edit connection");
const saveLabel = computed(() => props.state.mode === "create" ? "Add connection" : "Save changes");
const hasStoredApiKey = computed(() => Boolean(props.currentConfig?.apiKeyConfigured));
const managedConfigPath = getManagedConfigPath("ai-client");
const defaultManagedConfigPath = getDefaultManagedConfigPath("ai-client");
const fieldMeta = computed(() => getJsonSchemaFieldMetaMap(props.configSchema, BACKEND_FIELD_SCHEMA_PATHS));
const fieldLabel = {
  id: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.id, "ID")),
  name: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.name, "Name")),
  baseUrl: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.baseUrl, "Base URL")),
  connector: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.connector, "Connector")),
  enabled: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.enabled, "Enabled")),
  maxConcurrency: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.maxConcurrency, "Max concurrency")),
  healthPath: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.healthPath, "Health path")),
  models: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.models, "Allowed models")),
  headers: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.headers, "Headers (JSON)")),
  apiKeyEnv: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.apiKeyEnv, "API key env")),
  apiKey: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.apiKey, "API key")),
  timeoutMs: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.timeoutMs, "Request timeout (ms)")),
  monitoringTimeoutMs: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.monitoringTimeoutMs, "Monitoring timeout (ms)")),
  monitoringIntervalMs: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.monitoringIntervalMs, "Monitoring interval (ms)")),
  energyUsageUrl: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.energyUsageUrl, "Energy usage URL")),
};
const defaultModelsPlaceholder = "One model or pattern per line, for example:*\nllama-*";
const defaultHeadersPlaceholder = '{\n  "x-api-key": "..."\n}';
const draftFields = reactive<BackendEditorFields>({
  id: "",
  name: "",
  baseUrl: "",
  connector: "openai",
  enabled: true,
  maxConcurrency: "1",
  healthPath: "",
  modelsText: "*",
  headersText: "",
  apiKey: "",
  apiKeyEnv: "",
  clearApiKey: false,
  timeoutMs: "",
  monitoringTimeoutMs: "",
  monitoringIntervalMs: "",
  energyUsageUrl: "",
});

function assignDraftFields(): void {
  draftFields.id = props.state.fields.id;
  draftFields.name = props.state.fields.name;
  draftFields.baseUrl = props.state.fields.baseUrl;
  draftFields.connector = props.state.fields.connector;
  draftFields.enabled = props.state.fields.enabled;
  draftFields.maxConcurrency = props.state.fields.maxConcurrency;
  draftFields.healthPath = props.state.fields.healthPath;
  draftFields.modelsText = props.state.fields.modelsText;
  draftFields.headersText = props.state.fields.headersText;
  draftFields.apiKey = props.state.fields.apiKey;
  draftFields.apiKeyEnv = props.state.fields.apiKeyEnv;
  draftFields.clearApiKey = props.state.fields.clearApiKey;
  draftFields.timeoutMs = props.state.fields.timeoutMs;
  draftFields.monitoringTimeoutMs = props.state.fields.monitoringTimeoutMs;
  draftFields.monitoringIntervalMs = props.state.fields.monitoringIntervalMs;
  draftFields.energyUsageUrl = props.state.fields.energyUsageUrl;
}

watch(
  () => [props.state.open, props.state.mode, props.state.originalId, props.state.fields] as const,
  ([open]) => {
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
    id: draftFields.id,
    name: draftFields.name,
    baseUrl: draftFields.baseUrl,
    connector: draftFields.connector,
    enabled: draftFields.enabled,
    maxConcurrency: String(draftFields.maxConcurrency ?? ""),
    healthPath: draftFields.healthPath,
    modelsText: draftFields.modelsText,
    headersText: draftFields.headersText,
    apiKey: draftFields.apiKey,
    apiKeyEnv: draftFields.apiKeyEnv,
    clearApiKey: draftFields.clearApiKey,
    timeoutMs: String(draftFields.timeoutMs ?? ""),
    monitoringTimeoutMs: String(draftFields.monitoringTimeoutMs ?? ""),
    monitoringIntervalMs: String(draftFields.monitoringIntervalMs ?? ""),
    energyUsageUrl: draftFields.energyUsageUrl,
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
      class="request-detail-overlay backend-editor-overlay"
      @click.self="closeDialog"
    >
      <div class="request-detail-dialog backend-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="backend-editor-title">
        <div class="panel-header">
          <div>
            <h2 id="backend-editor-title" class="panel-title">{{ title }}</h2>
            <p class="hint">Changes are written to <span class="mono">{{ managedConfigPath }}</span>, which defaults to <span class="mono">{{ defaultManagedConfigPath }}</span> locally, and become active immediately.</p>
          </div>
          <DialogCloseButton compact :disabled="state.saving" @click="closeDialog" />
        </div>

        <div class="backend-editor-grid">
          <section class="request-detail-card">
            <div class="detail-card-viewport">
              <div class="field-grid backend-form-grid">
                <label class="field">
                  <span class="field-label">{{ fieldLabel.id }}</span>
                  <input
                    v-model="draftFields.id"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    :readonly="fieldMeta.id?.readOnly ?? false"
                    :disabled="fieldMeta.id?.readOnly ?? false"
                    :title="fieldMeta.id?.description"
                  />
                </label>

                <label class="field">
                  <span class="field-label">{{ fieldLabel.name }}</span>
                  <input
                    v-model="draftFields.name"
                    type="text"
                    autocomplete="off"
                    :readonly="fieldMeta.name?.readOnly ?? false"
                    :disabled="fieldMeta.name?.readOnly ?? false"
                    :title="fieldMeta.name?.description"
                  />
                </label>

                <label class="field">
                  <span class="field-label">{{ fieldLabel.baseUrl }}</span>
                  <input
                    v-model="draftFields.baseUrl"
                    type="text"
                    :placeholder="getJsonSchemaFieldExampleText(fieldMeta.baseUrl) || 'http://127.0.0.1:8080'"
                    autocomplete="off"
                    spellcheck="false"
                    :readonly="fieldMeta.baseUrl?.readOnly ?? false"
                    :disabled="fieldMeta.baseUrl?.readOnly ?? false"
                    :title="fieldMeta.baseUrl?.description"
                  />
                </label>

                <label class="field">
                  <span class="field-label">{{ fieldLabel.connector }}</span>
                  <select v-model="draftFields.connector" :disabled="fieldMeta.connector?.readOnly ?? false">
                    <option value="openai">OpenAI-compatible</option>
                    <option value="llama.cpp">llama.cpp</option>
                    <option value="ollama">Ollama</option>
                  </select>
                </label>

                <label class="field">
                  <span class="field-label">{{ fieldLabel.maxConcurrency }}</span>
                  <input
                    v-model="draftFields.maxConcurrency"
                    type="number"
                    min="1"
                    step="1"
                    inputmode="numeric"
                    :readonly="fieldMeta.maxConcurrency?.readOnly ?? false"
                    :disabled="fieldMeta.maxConcurrency?.readOnly ?? false"
                    :title="fieldMeta.maxConcurrency?.description"
                  />
                </label>

                <label class="field">
                  <span class="field-label">{{ fieldLabel.timeoutMs }}</span>
                  <input
                    v-model="draftFields.timeoutMs"
                    type="number"
                    min="1"
                    step="1"
                    inputmode="numeric"
                    placeholder="inherit server default"
                    :readonly="fieldMeta.timeoutMs?.readOnly ?? false"
                    :disabled="fieldMeta.timeoutMs?.readOnly ?? false"
                    :title="fieldMeta.timeoutMs?.description"
                  />
                </label>

                <label class="field">
                  <span class="field-label">{{ fieldLabel.monitoringTimeoutMs }}</span>
                  <input
                    v-model="draftFields.monitoringTimeoutMs"
                    type="number"
                    min="1"
                    step="1"
                    inputmode="numeric"
                    placeholder="default 5000"
                    :readonly="fieldMeta.monitoringTimeoutMs?.readOnly ?? false"
                    :disabled="fieldMeta.monitoringTimeoutMs?.readOnly ?? false"
                    :title="fieldMeta.monitoringTimeoutMs?.description"
                  />
                </label>

                <label class="field">
                  <span class="field-label">{{ fieldLabel.monitoringIntervalMs }}</span>
                  <input
                    v-model="draftFields.monitoringIntervalMs"
                    type="number"
                    min="1"
                    step="1"
                    inputmode="numeric"
                    placeholder="inherit server health interval"
                    :readonly="fieldMeta.monitoringIntervalMs?.readOnly ?? false"
                    :disabled="fieldMeta.monitoringIntervalMs?.readOnly ?? false"
                    :title="fieldMeta.monitoringIntervalMs?.description"
                  />
                </label>

                <label class="field field-span-2">
                  <span class="field-label">{{ fieldLabel.healthPath }}</span>
                  <input
                    v-model="draftFields.healthPath"
                    type="text"
                    :placeholder="getJsonSchemaFieldExampleText(fieldMeta.healthPath) || (draftFields.connector === 'ollama' ? '/api/tags' : '/v1/models')"
                    autocomplete="off"
                    spellcheck="false"
                    :readonly="fieldMeta.healthPath?.readOnly ?? false"
                    :disabled="fieldMeta.healthPath?.readOnly ?? false"
                    :title="fieldMeta.healthPath?.description"
                  />
                </label>

                <label class="field field-span-2">
                  <span class="field-label">{{ fieldLabel.energyUsageUrl }}</span>
                  <input
                    v-model="draftFields.energyUsageUrl"
                    type="text"
                    :placeholder="getJsonSchemaFieldExampleText(fieldMeta.energyUsageUrl) || 'http://127.0.0.1:9100/energy'"
                    autocomplete="off"
                    spellcheck="false"
                    :readonly="fieldMeta.energyUsageUrl?.readOnly ?? false"
                    :disabled="fieldMeta.energyUsageUrl?.readOnly ?? false"
                    :title="fieldMeta.energyUsageUrl?.description"
                  />
                </label>

                <label class="field field-span-2 checkbox-field">
                  <input v-model="draftFields.enabled" type="checkbox" :disabled="fieldMeta.enabled?.readOnly ?? false" />
                  <span>{{ fieldLabel.enabled }}</span>
                </label>
              </div>
            </div>
          </section>

          <section class="request-detail-card">
            <div class="detail-card-viewport">
              <div class="field-grid">
                <label class="field">
                  <span class="field-label">{{ fieldLabel.models }}</span>
                  <textarea
                    v-model="draftFields.modelsText"
                    :placeholder="getJsonSchemaFieldLineListExampleText(fieldMeta.models) || defaultModelsPlaceholder"
                    spellcheck="false"
                    :readonly="fieldMeta.models?.readOnly ?? false"
                    :disabled="fieldMeta.models?.readOnly ?? false"
                    :title="fieldMeta.models?.description"
                  ></textarea>
                </label>

                <label class="field">
                  <span class="field-label">{{ fieldLabel.headers }}</span>
                  <textarea
                    v-model="draftFields.headersText"
                    :placeholder="getJsonSchemaFieldJsonExampleText(fieldMeta.headers) || defaultHeadersPlaceholder"
                    spellcheck="false"
                    :readonly="fieldMeta.headers?.readOnly ?? false"
                    :disabled="fieldMeta.headers?.readOnly ?? false"
                    :title="fieldMeta.headers?.description"
                  ></textarea>
                </label>

                <label class="field">
                  <span class="field-label">{{ fieldLabel.apiKeyEnv }}</span>
                  <input
                    v-model="draftFields.apiKeyEnv"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="getJsonSchemaFieldExampleText(fieldMeta.apiKeyEnv) || 'UPSTREAM_API_KEY'"
                    :readonly="fieldMeta.apiKeyEnv?.readOnly ?? false"
                    :disabled="fieldMeta.apiKeyEnv?.readOnly ?? false"
                    :title="fieldMeta.apiKeyEnv?.description"
                  />
                </label>

                <label class="field">
                  <span class="field-label">{{ fieldLabel.apiKey }}</span>
                  <input
                    v-model="draftFields.apiKey"
                    :type="fieldMeta.apiKey?.writeOnly ? 'password' : 'text'"
                    :autocomplete="fieldMeta.apiKey?.writeOnly ? 'new-password' : 'off'"
                    placeholder="Leave empty to keep current secret"
                    :readonly="fieldMeta.apiKey?.readOnly ?? false"
                    :disabled="fieldMeta.apiKey?.readOnly ?? false"
                    :title="fieldMeta.apiKey?.description"
                  />
                  <span v-if="fieldMeta.apiKey?.writeOnly" class="hint">This value is write-only and will never be returned by the public config API.</span>
                  <span v-if="fieldMeta.apiKey?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
                </label>

                <label v-if="hasStoredApiKey" class="field checkbox-field">
                  <input v-model="draftFields.clearApiKey" type="checkbox" :disabled="fieldMeta.apiKey?.readOnly ?? false" />
                  <span>Clear stored API key</span>
                </label>
              </div>
            </div>
          </section>
        </div>

        <div class="backend-editor-actions">
          <div class="toggle-row">
            <button class="button" type="button" :disabled="state.saving || state.deleting" @click="submitDialog">
              {{ state.saving ? "Saving..." : saveLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
