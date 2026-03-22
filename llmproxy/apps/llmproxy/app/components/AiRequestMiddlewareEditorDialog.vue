<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import DialogCloseButton from "./DialogCloseButton.vue";
import { useDialogEscape } from "../composables/useDialogEscape";
import { getDefaultManagedConfigPath, getManagedConfigPath } from "../../../config/config-client";
import { getJsonSchemaFieldLabel, getJsonSchemaFieldMetaMap } from "../../../json-schema/json-schema-client";
import type {
  AiRequestMiddlewareEditorState,
  ConfigSchemaDocument,
  EditableAiRequestRoutingMiddleware,
} from "../types/dashboard";

const AI_REQUEST_MIDDLEWARE_FIELD_SCHEMA_PATHS = {
  id: ["middlewares", "*", "id"],
  url: ["middlewares", "*", "url"],
  smallModel: ["middlewares", "*", "models", "small"],
  largeModel: ["middlewares", "*", "models", "large"],
} as const;

const props = defineProps<{
  state: AiRequestMiddlewareEditorState;
  currentConfig?: EditableAiRequestRoutingMiddleware | null;
  configSchema?: ConfigSchemaDocument | null;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "save", fields: {
    id: string;
    url: string;
    smallModel: string;
    largeModel: string;
  }): void;
  (event: "delete"): void;
}>();

const title = computed(() => props.state.mode === "create" ? "Add request middleware" : "Edit request middleware");
const saveLabel = computed(() => props.state.mode === "create" ? "Add middleware" : "Save changes");

const draftFields = reactive({
  id: "",
  url: "",
  smallModel: "",
  largeModel: "",
});

const managedConfigPath = getManagedConfigPath("ai-request-middleware");
const defaultManagedConfigPath = getDefaultManagedConfigPath("ai-request-middleware");
const fieldMeta = computed(() => getJsonSchemaFieldMetaMap(props.configSchema, AI_REQUEST_MIDDLEWARE_FIELD_SCHEMA_PATHS));
const fieldLabel = {
  id: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.id, "Middleware id")),
  url: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.url, "Middleware URL")),
  smallModel: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.smallModel, "Small model")),
  largeModel: computed(() => getJsonSchemaFieldLabel(fieldMeta.value.largeModel, "Large model")),
};

function assignDraftFields(): void {
  draftFields.id = props.state.fields.id;
  draftFields.url = props.state.fields.url;
  draftFields.smallModel = props.state.fields.smallModel;
  draftFields.largeModel = props.state.fields.largeModel;
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
  if (props.state.saving || props.state.deleting) {
    return;
  }

  emit("close");
}

function submitDialog(): void {
  emit("save", {
    id: String(draftFields.id ?? ""),
    url: String(draftFields.url ?? ""),
    smallModel: String(draftFields.smallModel ?? ""),
    largeModel: String(draftFields.largeModel ?? ""),
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
      <div class="request-detail-dialog server-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-request-middleware-editor-title">
        <div class="panel-header">
          <div>
            <h2 id="ai-request-middleware-editor-title" class="panel-title">{{ title }}</h2>
            <p class="hint">
              Changes are written to <span class="mono">{{ managedConfigPath }}</span>.
              Locally, that defaults to <span class="mono">{{ defaultManagedConfigPath }}</span>.
              Use the selector <span class="mono">middleware:&lt;id&gt;</span> as the request model to activate one of these middleware routes.
            </p>
          </div>
          <DialogCloseButton :disabled="state.saving || state.deleting" @click="closeDialog" />
        </div>

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
                <span v-if="fieldMeta.id?.description" class="hint">{{ fieldMeta.id.description }}</span>
                <span v-if="fieldMeta.id?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>

              <label class="field field-span-2">
                <span class="field-label">{{ fieldLabel.url }}</span>
                <input
                  v-model="draftFields.url"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="https://router.example.com/route"
                  :readonly="fieldMeta.url?.readOnly ?? false"
                  :disabled="fieldMeta.url?.readOnly ?? false"
                  :title="fieldMeta.url?.description"
                />
                <span v-if="fieldMeta.url?.description" class="hint">{{ fieldMeta.url.description }}</span>
                <span v-if="fieldMeta.url?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>

              <label class="field">
                <span class="field-label">{{ fieldLabel.smallModel }}</span>
                <input
                  v-model="draftFields.smallModel"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="gpt-4.1-mini"
                  :readonly="fieldMeta.smallModel?.readOnly ?? false"
                  :disabled="fieldMeta.smallModel?.readOnly ?? false"
                  :title="fieldMeta.smallModel?.description"
                />
                <span v-if="fieldMeta.smallModel?.description" class="hint">{{ fieldMeta.smallModel.description }}</span>
                <span v-if="fieldMeta.smallModel?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>

              <label class="field">
                <span class="field-label">{{ fieldLabel.largeModel }}</span>
                <input
                  v-model="draftFields.largeModel"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="gpt-5"
                  :readonly="fieldMeta.largeModel?.readOnly ?? false"
                  :disabled="fieldMeta.largeModel?.readOnly ?? false"
                  :title="fieldMeta.largeModel?.description"
                />
                <span v-if="fieldMeta.largeModel?.description" class="hint">{{ fieldMeta.largeModel.description }}</span>
                <span v-if="fieldMeta.largeModel?.readOnly" class="hint">This field is marked read-only by the app schema.</span>
              </label>
            </div>
          </div>
        </section>

        <div class="backend-editor-actions">
          <div class="toggle-row">
            <button class="button" type="button" :disabled="state.saving || state.deleting || state.loading" @click="submitDialog">
              {{ state.saving ? "Saving..." : saveLabel }}
            </button>
            <button
              v-if="state.mode === 'edit'"
              class="button danger"
              type="button"
              :disabled="state.saving || state.deleting"
              @click="emit('delete')"
            >
              {{ state.deleting ? "Deleting..." : "Delete middleware" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
