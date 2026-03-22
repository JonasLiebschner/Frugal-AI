<script setup lang="ts">
import type { DebugParams } from "../types/dashboard";
import type { DebugModelOption } from "../../llmproxy-client";
import ChatAdvancedParametersFields from "./ChatAdvancedParametersFields.vue";

interface AdvancedParamHelp {
  temperature: string;
  top_p: string;
  top_k: string;
  min_p: string;
  repeat_penalty: string;
  max_completion_tokens: string;
  tool_choice: string;
}

const props = withDefaults(defineProps<{
  prompt: string;
  model: string;
  enableDiagnosticTools: boolean;
  mcpServerEnabled: boolean;
  params: DebugParams;
  modelOptions: DebugModelOption[];
  sending: boolean;
  showAdvancedParameters: boolean;
  submitLabel: string;
  promptPlaceholder: string;
  promptId: string;
  modelId: string;
  advancedIdPrefix: string;
  advancedParamHelp: AdvancedParamHelp;
  showPromptInput?: boolean;
}>(), {
  showPromptInput: true,
});

const emit = defineEmits<{
  (event: "update:prompt", value: string): void;
  (event: "update:model", value: string): void;
  (event: "update:enableDiagnosticTools", value: boolean): void;
  (event: "submit"): void;
  (event: "toggle-advanced"): void;
}>();

function handlePromptKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
    return;
  }

  event.preventDefault();
  emit("submit");
}
</script>

<template>
  <form
    class="chat-composer chat-composer-inline"
    :class="{ 'chat-composer-without-input': !props.showPromptInput }"
    @submit.prevent="emit('submit')"
  >
    <textarea
      v-if="props.showPromptInput"
      :id="promptId"
      :value="prompt"
      class="chat-editor-textarea"
      :placeholder="promptPlaceholder"
      @input="emit('update:prompt', ($event.target as HTMLTextAreaElement).value)"
      @keydown="handlePromptKeydown"
    ></textarea>

    <ChatAdvancedParametersFields
      v-if="showAdvancedParameters"
      :params="params"
      :help="advancedParamHelp"
      :id-prefix="advancedIdPrefix"
      :enable-diagnostic-tools="enableDiagnosticTools"
      :mcp-server-enabled="mcpServerEnabled"
    />

    <div class="chat-composer-actions">
      <div class="chat-composer-settings">
        <div class="field chat-composer-model-field">
          <div class="chat-composer-model-inline-control">
            <label class="field-label chat-composer-model-label" :for="modelId">Model</label>
            <select
              :id="modelId"
              :value="model"
              class="chat-composer-model-select"
              @change="emit('update:model', ($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="entry in modelOptions"
                :key="entry.key"
                :value="entry.value"
                :disabled="entry.disabled === true"
              >
                {{ entry.label }}
              </option>
            </select>
          </div>
        </div>

        <button
          class="icon-button compact chat-composer-advanced-toggle"
          type="button"
          :aria-label="showAdvancedParameters ? 'Hide advanced parameters' : 'Show advanced parameters'"
          :title="showAdvancedParameters ? 'Hide advanced parameters' : 'Show advanced parameters'"
          @click="emit('toggle-advanced')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 7h10"></path>
            <path d="M18 7h2"></path>
            <path d="M14 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z"></path>
            <path d="M4 12h4"></path>
            <path d="M12 12h8"></path>
            <path d="M8 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z"></path>
            <path d="M4 17h10"></path>
            <path d="M18 17h2"></path>
            <path d="M14 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z"></path>
          </svg>
        </button>

        <label
          class="chat-composer-tool-toggle"
          :for="`${modelId}-diagnostic-tools`"
          :title="mcpServerEnabled
            ? 'When enabled, chat requests include llmproxy functions from the MCP server and automatically execute their tool calls during the conversation.'
            : 'MCP server is disabled.'"
        >
          <input
            :id="`${modelId}-diagnostic-tools`"
            type="checkbox"
            :checked="enableDiagnosticTools"
            :disabled="!mcpServerEnabled"
            aria-label="Enable llmproxy functions for this chat"
            :title="mcpServerEnabled
              ? 'When enabled, chat requests include llmproxy functions from the MCP server and automatically execute their tool calls during the conversation.'
              : 'MCP server is disabled.'"
            @change="emit('update:enableDiagnosticTools', ($event.target as HTMLInputElement).checked)"
          >
          <span class="chat-composer-tool-toggle-label">Provide llmproxy MCP Tools</span>
        </label>

        <div class="chat-composer-primary-actions">
          <button class="button" type="submit">
            {{ submitLabel }}
          </button>
        </div>
      </div>
    </div>
  </form>
</template>
