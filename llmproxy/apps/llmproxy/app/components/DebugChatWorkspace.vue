<script setup lang="ts">
import { computed, ref } from "vue";
import ChatComposer from "./ChatComposer.vue";
import ConversationTranscript from "./ConversationTranscript.vue";
import ConversationSurface from "./ConversationSurface.vue";
import DialogCloseButton from "./DialogCloseButton.vue";
import SuggestionActionCards from "./SuggestionActionCards.vue";
import type {
  ConversationTranscriptItem,
  DebugTranscriptEntry,
  UiBadge,
} from "../types/dashboard";
import { useDashboardStore } from "../composables/useDashboardStore";
import { buildDebugModelOptions } from "../../llmproxy-client";
import { buildConversationItemsFromDebugTranscript } from "../utils/conversation-transcript";
import {
  debugChatFirstMessageSuggestions,
  debugChatSystemPromptSuggestions,
} from "../utils/debug-chat-suggestions";

const props = withDefaults(defineProps<{
  showCloseButton?: boolean;
  headingId?: string;
}>(), {
  showCloseButton: false,
  headingId: "",
});

const emit = defineEmits<{
  close: [];
}>();

const store = useDashboardStore();
const mcpServerEnabled = computed(() => store.state.mcpEnabled !== false);
const hasTranscript = computed(() => store.state.debug.transcript.length > 0);
const trimmedSystemPrompt = computed(() => store.state.debug.systemPrompt.trim());
const hasDraftInputs = computed(() => (
  trimmedSystemPrompt.value.length > 0 ||
  store.state.debug.prompt.trim().length > 0
));
const debugSubmitLabel = computed(() => (
  store.state.debug.sending ? "Queue message" : "Send message"
));
const clearChatTitle = computed(() => (
  store.state.debug.sending
    ? "Cancel the current request and clear the chat conversation"
    : (hasTranscript.value
      ? "Clear the current chat conversation"
      : "Reset the current chat inputs")
));
const showAdvancedParameters = ref(false);
const debugModelOptions = computed(() => (
  buildDebugModelOptions(store.state.models, store.state.aiRequestMiddlewares)
));
const advancedParamHelp = {
  temperature: "Controls randomness. Lower values are more deterministic, higher values are more creative. Typical range: 0.0 to 2.0. This UI accepts values >= 0.",
  top_p: "Nucleus sampling. The model samples only from the smallest token set whose cumulative probability reaches this value. Range: 0.0 to 1.0.",
  top_k: "Limits sampling to the K most likely next tokens. Lower values are stricter. Typical values: 0 to 100. This UI accepts integers >= 0.",
  min_p: "Filters out very unlikely tokens whose probability falls below a relative threshold. Range: 0.0 to 1.0.",
  repeat_penalty: "Penalizes repeated tokens. 1.0 means no penalty. Typical range: 1.0 to 1.5. This UI accepts values > 0.",
  max_completion_tokens: "Maximum tokens to generate for the response. This UI sends the value as max_completion_tokens and accepts integers >= 1. The effective limit may still be lower if the backend or model enforces a smaller cap.",
  tool_choice: "Controls how the model uses llmproxy functions. Auto lets the model decide, required forces at least one tool call before answering, and none forbids tool calls even when functions are available.",
} as const;

const systemPromptSuggestionItems = computed(() => (
  debugChatSystemPromptSuggestions.map((entry) => ({
    key: entry.key,
    title: entry.title,
    description: entry.description,
    active: store.state.debug.systemPrompt.trim() === entry.value.trim(),
    highlighted: entry.highlighted === true,
  }))
));

const firstMessageSuggestionItems = computed(() => (
  debugChatFirstMessageSuggestions.map((entry) => ({
    key: entry.key,
    title: entry.title,
    description: entry.description,
    active: store.state.debug.prompt.trim() === entry.value.trim(),
    highlighted: "highlighted" in entry && entry.highlighted === true,
  }))
));

function applySystemPromptSuggestion(key: string): void {
  const match = debugChatSystemPromptSuggestions.find((entry) => entry.key === key);
  if (!match) {
    return;
  }

  if (store.state.debug.systemPrompt.trim() === match.value.trim()) {
    store.state.debug.systemPrompt = "";
    return;
  }

  store.state.debug.systemPrompt = match.value;
}

function applyFirstMessageSuggestion(key: string): void {
  const match = debugChatFirstMessageSuggestions.find((entry) => entry.key === key);
  if (!match) {
    return;
  }

  if (store.state.debug.prompt.trim() === match.value.trim()) {
    store.state.debug.prompt = "";
    store.state.debug.defaultPromptDismissed = true;
    return;
  }

  store.state.debug.prompt = match.value;
  store.state.debug.defaultPromptDismissed = false;
}

function handleInitialPromptKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
    return;
  }

  event.preventDefault();
  void store.sendDebugChat();
}

store.ensureDefaultDebugPrompt();

function shouldCollapseDebugReasoning(entry: DebugTranscriptEntry, index: number): boolean {
  void entry;
  void index;
  return true;
}

function getDebugTranscript(): DebugTranscriptEntry[] {
  return store.state.debug.transcript as unknown as DebugTranscriptEntry[];
}

const chatConversationSignature = computed<string>(() => {
  const transcript = getDebugTranscript();
  const lastEntry = transcript.length > 0
    ? transcript[transcript.length - 1] as DebugTranscriptEntry
    : null;

  const queuedBits = store.state.debug.queuedMessages.map((entry, index) => (
    `${index}:${entry.model}:${entry.enableDiagnosticTools ? "tools" : "plain"}:${entry.prompt.length}`
  ));

  return [
    hasTranscript.value ? "ready" : "initial",
    trimmedSystemPrompt.value.length,
    store.state.debug.sending ? "sending" : "idle",
    transcript.length,
    lastEntry?.role ?? "",
    lastEntry?.pending ? "pending" : "ready",
    lastEntry?.finish_reason ?? "",
    queuedBits.join("|"),
  ].join("|");
});

const debugTranscriptItems = computed<ConversationTranscriptItem[]>(() => {
  const transcript = getDebugTranscript();
  const items: ConversationTranscriptItem[] = [];

  if (hasTranscript.value && trimmedSystemPrompt.value) {
    items.push({
      key: "system-prompt",
      message: { role: "system", content: trimmedSystemPrompt.value },
      index: 0,
      reasoningCollapsed: true,
    });
  }

  const offset = items.length;
  const transcriptItems: ConversationTranscriptItem[] = buildConversationItemsFromDebugTranscript(transcript, {
    startIndex: offset,
    hideFinishBadge: true,
    reasoningCollapsed: true,
    keyPrefix: "chat",
  }).map((item, index): ConversationTranscriptItem => ({
    ...item,
    reasoningCollapsed: shouldCollapseDebugReasoning(transcript[index] as DebugTranscriptEntry, index),
    extraBadges: [] as UiBadge[],
  }));

  const queuedOffset = offset + transcriptItems.length;
  const queuedItems: ConversationTranscriptItem[] = store.state.debug.queuedMessages.map((entry, index) => ({
    key: `queued:${index}:${entry.model}:${entry.prompt.length}`,
    message: {
      role: "user",
      content: entry.prompt,
    },
    index: queuedOffset + index,
    reasoningCollapsed: true,
    extraBadges: [{
      text: index === 0 ? "queued next" : `queued ${index + 1}`,
      tone: "neutral",
      title: index === 0
        ? "This message is queued and will be sent automatically as soon as the current assistant turn finishes."
        : `This message is queued in position ${index + 1} and will be sent automatically in order.`,
    }],
  }));

  return [...items, ...transcriptItems, ...queuedItems];
});

</script>

<template>
  <div class="chat-panel">
    <div class="chat-thread">
      <div class="panel chat-conversation-shell">
        <div class="panel-header">
          <h2 v-if="props.headingId" :id="props.headingId" class="sr-only">Playground</h2>
          <div class="conversation-surface-actions ml-auto">
            <button
              v-if="store.state.debug.lastRequestId"
              class="icon-button compact"
              type="button"
              aria-label="Open the last debug request in the request debugger"
              title="Open the last debug request in the request debugger."
              @click="store.openLastDebugRequest()"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6.5V5.25a3 3 0 0 1 6 0V6.5"></path>
                <path d="M8.5 8h7A1.5 1.5 0 0 1 17 9.5v4.9a5 5 0 0 1-10 0V9.5A1.5 1.5 0 0 1 8.5 8Z"></path>
                <path d="M12 3.5v1.75"></path>
                <path d="M7 11.75H4.75"></path>
                <path d="M19.25 11.75H17"></path>
                <path d="M7.2 9.35 5.25 7.8"></path>
                <path d="M16.8 9.35 18.75 7.8"></path>
                <path d="M7.2 15.65 5.25 17.2"></path>
                <path d="M16.8 15.65 18.75 17.2"></path>
              </svg>
            </button>
            <button
              class="icon-button compact"
              type="button"
              :aria-label="clearChatTitle"
              :title="clearChatTitle"
              @click="store.clearDebugChat()"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 4.75h6"></path>
                <path d="M4.75 7.5h14.5"></path>
                <path d="M7.5 7.5 8.2 17a2 2 0 0 0 2 1.85h3.6a2 2 0 0 0 2-1.85l.7-9.5"></path>
                <path d="M10 11v4.5"></path>
                <path d="M14 11v4.5"></path>
              </svg>
            </button>
            <DialogCloseButton
              v-if="showCloseButton"
              compact
              title="Close chat"
              aria-label="Close chat"
              @click="emit('close')"
            />
          </div>
        </div>
        <ConversationSurface
          card-class="chat-conversation-card"
          :viewport-class="hasTranscript ? 'chat-conversation-viewport' : 'chat-conversation-viewport chat-conversation-viewport-initial'"
          :reset-key="hasTranscript ? 'ready' : 'initial'"
          :scroll-signature="chatConversationSignature"
          :scroll-target="hasTranscript ? 'bottom' : 'top'"
          follow-mode="latest-turn-start"
          :follow-anchor-active="store.state.debug.sending"
        >
          <ConversationTranscript
            v-if="hasTranscript"
            :items="debugTranscriptItems"
            empty-text=""
            bubble-layout
            class="chat-transcript"
          />
          <div
            v-else
            class="chat-initial-layout"
            :class="{ 'chat-initial-layout-compact': showAdvancedParameters }"
          >
            <div class="chat-initial-suggestions">
              <div class="chat-suggestion-section">
                <div class="diagnostics-section-label">System prompt ideas</div>
                <SuggestionActionCards
                  class="chat-suggestion-grid"
                  :items="systemPromptSuggestionItems"
                  :show-highlighted-badge="false"
                  @select="applySystemPromptSuggestion"
                />
              </div>

              <div class="chat-suggestion-section">
                <div class="diagnostics-section-label">Message ideas</div>
                <SuggestionActionCards
                  class="chat-suggestion-grid"
                  :items="firstMessageSuggestionItems"
                  :show-highlighted-badge="false"
                  @select="applyFirstMessageSuggestion"
                />
              </div>
            </div>

            <div class="chat-initial-editors">
              <div class="chat-editor-turn chat-initial-system-turn">
                <div class="diagnostics-section-label">System Prompt</div>
                <textarea
                  id="debug-system-prompt"
                  v-model="store.state.debug.systemPrompt"
                  class="chat-editor-textarea"
                  placeholder="Optional high-level instruction (System Prompt) for the model."
                ></textarea>
              </div>

              <div class="chat-editor-turn chat-initial-prompt-turn">
                <div class="diagnostics-section-label">Prompt</div>
                <textarea
                  id="debug-prompt"
                  v-model="store.state.debug.prompt"
                  class="chat-editor-textarea"
                  placeholder="Enter the first user message to send through the proxy."
                  @keydown="handleInitialPromptKeydown"
                ></textarea>
              </div>
            </div>
          </div>

          <template #footer>
            <ChatComposer
              :prompt="store.state.debug.prompt"
              :model="store.state.debug.model"
              :enable-diagnostic-tools="store.state.debug.enableDiagnosticTools"
              :mcp-server-enabled="mcpServerEnabled"
              :params="store.state.debug.params"
              :model-options="debugModelOptions"
              :sending="store.state.debug.sending"
              :show-advanced-parameters="showAdvancedParameters"
              :submit-label="debugSubmitLabel"
              :show-prompt-input="hasTranscript"
              :prompt-placeholder="hasTranscript ? 'Enter the next message to continue the conversation.' : 'Enter the first user message to send through the proxy.'"
              :prompt-id="hasTranscript ? 'debug-follow-up' : 'debug-prompt-footer'"
              :model-id="hasTranscript ? 'debug-follow-up-model' : 'debug-model'"
              :advanced-id-prefix="hasTranscript ? 'debug-follow-up' : 'debug'"
              :advanced-param-help="advancedParamHelp"
              @update:prompt="store.state.debug.prompt = $event"
              @update:model="store.state.debug.model = $event"
              @update:enable-diagnostic-tools="store.state.debug.enableDiagnosticTools = $event"
              @submit="store.sendDebugChat()"
              @toggle-advanced="showAdvancedParameters = !showAdvancedParameters"
            />
          </template>
        </ConversationSurface>
      </div>
    </div>
  </div>
</template>
