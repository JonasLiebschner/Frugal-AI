<script setup lang="ts">
import { computed, ref, watch } from "vue";
import SuggestionActionCards from "./SuggestionActionCards.vue";
import type {
  DiagnosticPromptPayload,
  DiagnosticReport,
} from "../types/dashboard";
import { useDiagnosticsCapabilities } from "../composables/useDiagnosticsCapabilities";
import { useDashboardStore } from "../composables/useDashboardStore";
import { getDiagnosticPrompt } from "../../llmproxy-client";

const props = defineProps<{
  requestId: string;
  report: DiagnosticReport | null;
}>();

const store = useDashboardStore();
const { mcpServerEnabled, promptDefinitions } = useDiagnosticsCapabilities();
const loadingPrompt = ref(false);
const promptPayload = ref<DiagnosticPromptPayload | null>(null);
const selectedPromptName = ref("");

const promptButtons = computed(() => {
  const recommended = new Set(props.report?.recommendedPrompts ?? []);
  return [...promptDefinitions.value].sort((left, right) => {
    const leftRecommended = recommended.has(left.name);
    const rightRecommended = recommended.has(right.name);
    if (leftRecommended === rightRecommended) {
      return left.title.localeCompare(right.title);
    }

    return leftRecommended ? -1 : 1;
  });
});

const promptCardItems = computed(() => (
  promptButtons.value.map((prompt) => ({
    key: prompt.name,
    title: prompt.title,
    description: prompt.description,
    active: selectedPromptName.value === prompt.name,
    highlighted: props.report?.recommendedPrompts.includes(prompt.name) === true,
  }))
));

watch(
  () => [props.requestId, props.report?.requestId, mcpServerEnabled.value] as const,
  async ([requestId, reportRequestId, enabled]) => {
    promptPayload.value = null;
    selectedPromptName.value = "";

    if (enabled !== true || !requestId || !reportRequestId || requestId !== reportRequestId) {
      return;
    }

    const preferredPrompt = props.report?.recommendedPrompts[0] || "diagnose-request";
    await loadPrompt(preferredPrompt);
  },
  { immediate: true },
);

async function loadPrompt(promptName: string): Promise<void> {
  if (!props.requestId || !props.report || mcpServerEnabled.value !== true) {
    return;
  }

  const requestIdAtStart = props.requestId;
  selectedPromptName.value = promptName;
  loadingPrompt.value = true;

  try {
    const payload = await getDiagnosticPrompt(promptName, requestIdAtStart);
    if (props.requestId !== requestIdAtStart) {
      return;
    }
    promptPayload.value = payload;
  } catch (error) {
    promptPayload.value = null;
    store.showToast("Diagnosis", error instanceof Error ? error.message : String(error));
  } finally {
    loadingPrompt.value = false;
  }
}

async function openPromptInChat(): Promise<void> {
  if (!promptPayload.value || promptPayload.value.messages.length === 0) {
    return;
  }

  const systemPrompt = promptPayload.value.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const userPrompt = promptPayload.value.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.text.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!userPrompt) {
    store.showToast("Diagnosis", "The selected diagnostics prompt does not include a user message.");
    return;
  }

  store.startDebugChatDialog(systemPrompt, userPrompt);
}
</script>

<template>
  <section class="request-detail-section diagnosis-actions-section">
    <div class="diagnosis-actions-head">
      <div class="diagnostics-section-label">LLM followup</div>
    </div>

    <SuggestionActionCards
      v-if="mcpServerEnabled === true"
      :items="promptCardItems"
      @select="loadPrompt"
    />
    <div v-else-if="mcpServerEnabled === false" class="empty">MCP server is disabled.</div>
    <div v-else class="empty">Loading MCP capabilities...</div>

    <div class="mt-3 flex justify-start">
      <button
        class="context-action-button"
        type="button"
        :disabled="loadingPrompt || !promptPayload || promptPayload.messages.length === 0"
        :title="loadingPrompt ? 'Preparing analyzer prompt...' : 'Start a new chat session from the selected analyzer action.'"
        :aria-label="loadingPrompt ? 'Preparing analyzer prompt' : 'Start a new chat session from the selected analyzer action'"
        @click="openPromptInChat"
      >
        <span class="context-action-button-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5.5 7.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H11l-3.5 3v-3H7.5a2 2 0 0 1-2-2z"></path>
          </svg>
        </span>
        <span class="context-action-button-label">{{ loadingPrompt ? "Preparing chat..." : "Begin troubleshooting" }}</span>
      </button>
    </div>
  </section>
</template>
