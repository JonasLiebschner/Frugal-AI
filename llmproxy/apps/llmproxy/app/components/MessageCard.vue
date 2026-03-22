<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { UiBadge } from "../types/dashboard";
import { renderMessageHtml } from "../utils/message-rendering";

interface MessageLike extends Record<string, unknown> {
  role?: string;
}

const persistedReasoningState = new Map<string, boolean>();
const MAX_PERSISTED_REASONING_STATES = 400;

const props = withDefaults(defineProps<{
  message: MessageLike;
  index: number;
  itemKey?: string | number;
  heading?: string;
  bubbleLayout?: boolean;
  finishReason?: string;
  hideFinishBadge?: boolean;
  reasoningCollapsed?: boolean;
  extraBadges?: UiBadge[];
}>(), {
  heading: "",
  bubbleLayout: false,
  finishReason: "",
  hideFinishBadge: false,
  reasoningCollapsed: true,
  extraBadges: () => [],
});

const hostEl = ref<HTMLElement | null>(null);
const reasoningExpanded = ref(false);
const reasoningStateKey = computed(() => String(
  props.itemKey ?? `${props.index}:${typeof props.message.role === "string" ? props.message.role : "unknown"}`,
));
const inlineCodeViewers = useInlineCodeViewers(hostEl, {
  readOnly: true,
  scrollPastEnd: 0,
  padding: 10,
  onError(error) {
    console.error("Failed to initialize inline code viewer.", error);
  },
});

watch(
  reasoningStateKey,
  (nextKey) => {
    reasoningExpanded.value = persistedReasoningState.get(nextKey) ?? false;
  },
  { immediate: true },
);

function rememberReasoningState(key: string, expanded: boolean): void {
  if (persistedReasoningState.has(key)) {
    persistedReasoningState.delete(key);
  }

  persistedReasoningState.set(key, expanded);

  while (persistedReasoningState.size > MAX_PERSISTED_REASONING_STATES) {
    const oldestKey = persistedReasoningState.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }

    persistedReasoningState.delete(oldestKey);
  }
}

function queueInlineCodeViewerRefresh(scope?: HTMLElement | null): void {
  inlineCodeViewers.queueRefresh(scope);
}

function handleReasoningToggle(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLDetailsElement)) {
    return;
  }

  if (target.classList.contains("compact-bubble-panel-tool")) {
    queueInlineCodeViewerRefresh(target);
  }

  if (target.classList.contains("compact-bubble-panel-embedded")) {
    queueInlineCodeViewerRefresh(target);
  }
}

function handleReasoningClick(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const summary = target.closest(".compact-bubble-summary");
  if (!(summary instanceof HTMLElement)) {
    return;
  }

  const panel = summary.closest(".compact-bubble-panel");
  if (!(panel instanceof HTMLElement)) {
    return;
  }

  if (panel.classList.contains("compact-bubble-panel-reasoning")) {
    event.preventDefault();
    const nextExpanded = !reasoningExpanded.value;
    reasoningExpanded.value = nextExpanded;
    rememberReasoningState(reasoningStateKey.value, nextExpanded);
  }
}

async function refreshInlineCodeViewers(scope?: HTMLElement): Promise<void> {
  await inlineCodeViewers.refresh(scope);
}

const html = computed(() => renderMessageHtml(props.message, props.index, {
  heading: props.heading || undefined,
  finishReason: props.finishReason || "",
  hideFinishBadge: props.hideFinishBadge,
  reasoningCollapsed: reasoningExpanded.value ? false : props.reasoningCollapsed,
  extraBadges: props.extraBadges,
  hideRoleBadge: props.bubbleLayout && (role.value === "system" || role.value === "tool"),
  hideModelBadge: props.bubbleLayout && role.value === "assistant",
  hideToolMetaBadges: props.bubbleLayout && role.value === "tool",
}));

const role = computed(() => (
  typeof props.message.role === "string" && props.message.role.trim().length > 0
    ? props.message.role.trim().toLowerCase()
    : "unknown"
));

const showAvatar = computed(() => props.bubbleLayout && (role.value === "user" || role.value === "assistant" || role.value === "system" || role.value === "tool"));

const assistantAvatarTitle = computed(() => {
  if (role.value !== "assistant") {
    return "";
  }

  const model =
    typeof props.message.model === "string" && props.message.model.trim().length > 0
      ? props.message.model.trim()
      : "";

  return model ? `Model: ${model}` : "";
});

const toolAvatarTitle = computed(() => {
  if (role.value !== "tool") {
    return "";
  }

  const parts: string[] = [];
  const toolName =
    typeof props.message.name === "string" && props.message.name.trim().length > 0
      ? props.message.name.trim()
      : "";
  const toolCallId =
    typeof props.message.tool_call_id === "string" && props.message.tool_call_id.trim().length > 0
      ? props.message.tool_call_id.trim()
      : "";

  if (toolName) {
    parts.push(`Tool: ${toolName}`);
  }

  if (toolCallId) {
    parts.push(`Call id: ${toolCallId}`);
  }

  return parts.join("\n");
});

const hostClass = computed(() => {
  const normalizedRole = role.value;

  return [
    "message-card-host",
    `role-${normalizedRole}`,
    props.bubbleLayout ? "bubble-layout" : "",
    showAvatar.value ? "with-avatar" : "",
  ];
});

onMounted(() => {
  hostEl.value?.addEventListener("click", handleReasoningClick, true);
  hostEl.value?.addEventListener("toggle", handleReasoningToggle, true);
  void refreshInlineCodeViewers();
});

onBeforeUnmount(() => {
  hostEl.value?.removeEventListener("click", handleReasoningClick, true);
  hostEl.value?.removeEventListener("toggle", handleReasoningToggle, true);
});

watch(html, () => {
  void refreshInlineCodeViewers();
});
</script>

<template>
  <div :class="hostClass">
    <div
      v-if="showAvatar && role === 'system'"
      class="message-avatar"
      :class="`role-${role}`"
      title="System prompt"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="6.75"></circle>
        <path d="M12 3.75v2.5"></path>
        <path d="M12 17.75v2.5"></path>
        <path d="M3.75 12h2.5"></path>
        <path d="M17.75 12h2.5"></path>
        <path d="M6.1 6.1 7.9 7.9"></path>
        <path d="M16.1 16.1 17.9 17.9"></path>
        <path d="M16.1 7.9 17.9 6.1"></path>
        <path d="M6.1 17.9 7.9 16.1"></path>
        <path d="M12 9.1a2.9 2.9 0 0 1 2.9 2.9"></path>
      </svg>
    </div>

    <div
      v-if="showAvatar && role === 'assistant'"
      class="message-avatar"
      :class="`role-${role}`"
      :title="assistantAvatarTitle || undefined"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="8" width="12" height="9" rx="2.5"></rect>
        <path d="M12 4.5v2.5"></path>
        <path d="M9.5 17v2"></path>
        <path d="M14.5 17v2"></path>
        <path d="M6 12H4.5"></path>
        <path d="M19.5 12H18"></path>
        <circle cx="10" cy="11.5" r="0.9" fill="currentColor" stroke="none"></circle>
        <circle cx="14" cy="11.5" r="0.9" fill="currentColor" stroke="none"></circle>
        <path d="M9.5 14.2c.8.5 1.7.8 2.5.8s1.7-.3 2.5-.8"></path>
      </svg>
    </div>

    <div ref="hostEl" class="message-card-body" v-html="html"></div>

    <div
      v-if="showAvatar && role === 'tool'"
      class="message-avatar"
      :class="`role-${role}`"
      :title="toolAvatarTitle || undefined"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4.75" y="5.25" width="14.5" height="13.5" rx="3"></rect>
        <path d="M4.75 8.5h14.5"></path>
        <circle cx="7.5" cy="6.85" r="0.6" fill="currentColor" stroke="none"></circle>
        <circle cx="10" cy="6.85" r="0.6" fill="currentColor" stroke="none"></circle>
        <path d="m9 12.05 2.15 2.15L9 16.35"></path>
        <path d="M13.35 16.35h2.4"></path>
        <path d="M18.45 4.85v2"></path>
        <path d="M17.45 5.85h2"></path>
      </svg>
    </div>

    <div
      v-if="showAvatar && role === 'user'"
      class="message-avatar"
      :class="`role-${role}`"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="8"></circle>
        <circle cx="9.5" cy="10.5" r="0.9" fill="currentColor" stroke="none"></circle>
        <circle cx="14.5" cy="10.5" r="0.9" fill="currentColor" stroke="none"></circle>
        <path d="M8.5 14.2c1 .9 2.2 1.3 3.5 1.3s2.5-.4 3.5-1.3"></path>
      </svg>
    </div>
  </div>
</template>
