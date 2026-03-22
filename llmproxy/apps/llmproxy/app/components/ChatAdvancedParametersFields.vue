<script setup lang="ts">
import type { DebugParams } from "../types/dashboard";

interface AdvancedParamHelp {
  temperature: string;
  top_p: string;
  top_k: string;
  min_p: string;
  repeat_penalty: string;
  max_completion_tokens: string;
  tool_choice: string;
}

defineProps<{
  params: DebugParams;
  help: AdvancedParamHelp;
  idPrefix: string;
  enableDiagnosticTools: boolean;
  mcpServerEnabled: boolean;
}>();
</script>

<template>
  <div class="chat-advanced-inline">
    <div class="chat-advanced-body">
      <div class="param-grid">
        <div class="field">
          <div class="field-label-row">
            <label class="field-label" :for="`${idPrefix}-temperature`">Temperature</label>
            <span class="chat-param-help" :title="help.temperature" aria-label="Temperature help">i</span>
          </div>
          <input
            :id="`${idPrefix}-temperature`"
            v-model.number="params.temperature"
            :title="help.temperature"
            type="number"
            step="0.1"
            min="0"
          />
        </div>
        <div class="field">
          <div class="field-label-row">
            <label class="field-label" :for="`${idPrefix}-top-p`">Top P</label>
            <span class="chat-param-help" :title="help.top_p" aria-label="Top P help">i</span>
          </div>
          <input
            :id="`${idPrefix}-top-p`"
            v-model.number="params.top_p"
            :title="help.top_p"
            type="number"
            step="0.01"
            min="0"
            max="1"
          />
        </div>
        <div class="field">
          <div class="field-label-row">
            <label class="field-label" :for="`${idPrefix}-top-k`">Top K</label>
            <span class="chat-param-help" :title="help.top_k" aria-label="Top K help">i</span>
          </div>
          <input
            :id="`${idPrefix}-top-k`"
            v-model.number="params.top_k"
            :title="help.top_k"
            type="number"
            step="1"
            min="0"
          />
        </div>
        <div class="field">
          <div class="field-label-row">
            <label class="field-label" :for="`${idPrefix}-min-p`">Min P</label>
            <span class="chat-param-help" :title="help.min_p" aria-label="Min P help">i</span>
          </div>
          <input
            :id="`${idPrefix}-min-p`"
            v-model.number="params.min_p"
            :title="help.min_p"
            type="number"
            step="0.01"
            min="0"
            max="1"
          />
        </div>
        <div class="field">
          <div class="field-label-row">
            <label class="field-label" :for="`${idPrefix}-repeat-penalty`">Repeat Penalty</label>
            <span class="chat-param-help" :title="help.repeat_penalty" aria-label="Repeat Penalty help">i</span>
          </div>
          <input
            :id="`${idPrefix}-repeat-penalty`"
            v-model.number="params.repeat_penalty"
            :title="help.repeat_penalty"
            type="number"
            step="0.05"
            min="0"
          />
        </div>
        <div class="field">
          <div class="field-label-row">
            <label class="field-label" :for="`${idPrefix}-max-completion-tokens`">Max Tokens</label>
            <span class="chat-param-help" :title="help.max_completion_tokens" aria-label="Max Tokens help">i</span>
          </div>
          <input
            :id="`${idPrefix}-max-completion-tokens`"
            v-model.number="params.max_completion_tokens"
            :title="help.max_completion_tokens"
            type="number"
            step="1"
            min="1"
          />
        </div>
        <div class="field">
          <div class="field-label-row">
            <label class="field-label" :for="`${idPrefix}-tool-choice`">Tool choice</label>
            <span class="chat-param-help" :title="help.tool_choice" aria-label="Tool choice help">i</span>
          </div>
          <select
            :id="`${idPrefix}-tool-choice`"
            v-model="params.tool_choice"
            :title="help.tool_choice"
            :disabled="!enableDiagnosticTools || !mcpServerEnabled"
          >
            <option value="auto">auto</option>
            <option value="required">force tool</option>
            <option value="none">none</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>
