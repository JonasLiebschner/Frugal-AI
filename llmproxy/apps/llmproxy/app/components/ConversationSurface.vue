<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useSlots, watch } from "vue";
import { scheduleAfterBrowserPaint } from "../utils/browserPaint";

const props = withDefaults(defineProps<{
  title?: string;
  cardClass?: string;
  viewportClass?: string;
  resetKey?: string | number;
  scrollSignature?: string | number;
  scrollTarget?: "top" | "bottom";
  followMode?: "bottom" | "latest-turn-start";
  followAnchorSelector?: string;
  followAnchorActive?: boolean;
}>(), {
  title: "",
  cardClass: "",
  viewportClass: "",
  resetKey: "",
  scrollSignature: "",
  scrollTarget: "bottom",
  followMode: "bottom",
  followAnchorSelector: ".turn.assistant",
  followAnchorActive: false,
});

const slots = useSlots();
const conversationViewport = ref<HTMLElement | null>(null);
const autoFollowConversation = ref(true);
let conversationObserver: MutationObserver | null = null;
let anchoredScrollTop: number | null = null;
let lastObservedScrollTop = 0;

function findFollowAnchorElement(): HTMLElement | null {
  const viewport = conversationViewport.value;
  if (!viewport) {
    return null;
  }

  const rawAnchors = Array.from(viewport.querySelectorAll<HTMLElement>(props.followAnchorSelector));
  const rawAnchor = rawAnchors[rawAnchors.length - 1] ?? null;
  if (!rawAnchor) {
    return null;
  }

  return rawAnchor.closest<HTMLElement>(".message-card-host") ?? rawAnchor;
}

function hasSlot(name: "headerMeta" | "headerActions" | "footer"): boolean {
  return Boolean(slots[name]);
}

function isConversationNearBottom(): boolean {
  const viewport = conversationViewport.value;
  if (!viewport) {
    return true;
  }

  return viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 28;
}

function scrollConversationToBottom(): void {
  const viewport = conversationViewport.value;
  if (!viewport) {
    return;
  }

  viewport.scrollTop = viewport.scrollHeight;
  lastObservedScrollTop = viewport.scrollTop;
}

function scrollConversationToTop(): void {
  const viewport = conversationViewport.value;
  if (!viewport) {
    return;
  }

  viewport.scrollTop = 0;
  lastObservedScrollTop = viewport.scrollTop;
}

function computeAnchoredScrollTop(): number | null {
  const viewport = conversationViewport.value;
  const anchor = findFollowAnchorElement();
  if (!viewport || !anchor) {
    return null;
  }

  const anchorCard = anchor.closest<HTMLElement>(".message-card-host") ?? anchor;
  const previousCard = anchorCard.previousElementSibling as HTMLElement | null;

  if (previousCard) {
    return Math.max(0, previousCard.offsetTop - 12);
  }

  return Math.max(0, anchorCard.offsetTop - 12);
}

function scrollConversationToAnchorIfPossible(): boolean {
  const viewport = conversationViewport.value;
  if (!viewport || props.followMode !== "latest-turn-start" || !props.followAnchorActive) {
    return false;
  }

  if (anchoredScrollTop === null) {
    const nextAnchoredScrollTop = computeAnchoredScrollTop();
    if (nextAnchoredScrollTop === null) {
      return false;
    }

    anchoredScrollTop = nextAnchoredScrollTop;
  }

  const anchor = findFollowAnchorElement();
  if (!anchor) {
    return false;
  }

  const anchorCard = anchor.closest<HTMLElement>(".message-card-host") ?? anchor;
  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const baseScrollTop = Math.min(anchoredScrollTop, maxScrollTop);
  const anchorBottomAtBase = anchorCard.offsetTop + anchorCard.offsetHeight - baseScrollTop;

  if (anchorBottomAtBase <= viewport.clientHeight - 8) {
    viewport.scrollTop = baseScrollTop;
    lastObservedScrollTop = viewport.scrollTop;
    return true;
  }

  const followScrollTop = Math.max(
    baseScrollTop,
    anchorCard.offsetTop + anchorCard.offsetHeight - viewport.clientHeight + 8,
  );
  viewport.scrollTop = Math.min(followScrollTop, maxScrollTop);
  lastObservedScrollTop = viewport.scrollTop;
  return true;
}

function scheduleConversationScrollToBottom(): void {
  scheduleAfterBrowserPaint(() => {
    if (!autoFollowConversation.value) {
      return;
    }

    if (props.scrollTarget === "top") {
      scrollConversationToTop();
      return;
    }

    if (props.followMode === "latest-turn-start" && props.followAnchorActive) {
      if (scrollConversationToAnchorIfPossible()) {
        return;
      }
    }

    scrollConversationToBottom();
  });
}

function handleConversationScroll(): void {
  const viewport = conversationViewport.value;
  if (!viewport) {
    return;
  }

  const nextScrollTop = viewport.scrollTop;
  const movedUp = nextScrollTop < lastObservedScrollTop - 2;
  const nearBottom = isConversationNearBottom();

  if (nearBottom) {
    autoFollowConversation.value = true;
  } else if (movedUp) {
    autoFollowConversation.value = false;
  }

  lastObservedScrollTop = nextScrollTop;
}

function bindConversationObserver(): void {
  conversationObserver?.disconnect();
  conversationObserver = null;

  const viewport = conversationViewport.value;
  if (!viewport || typeof MutationObserver === "undefined") {
    return;
  }

  conversationObserver = new MutationObserver(() => {
    if (!autoFollowConversation.value) {
      return;
    }

    scheduleConversationScrollToBottom();
  });

  conversationObserver.observe(viewport, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

onMounted(() => {
  bindConversationObserver();
  lastObservedScrollTop = conversationViewport.value?.scrollTop ?? 0;
  scheduleConversationScrollToBottom();
});

onBeforeUnmount(() => {
  conversationObserver?.disconnect();
  conversationObserver = null;
});

watch(
  () => props.resetKey,
  () => {
    autoFollowConversation.value = true;
    anchoredScrollTop = null;
    lastObservedScrollTop = conversationViewport.value?.scrollTop ?? 0;
    scheduleConversationScrollToBottom();
  },
  { flush: "post" },
);

watch(
  () => props.scrollSignature,
  () => {
    scheduleConversationScrollToBottom();
  },
  { flush: "post" },
);

watch(
  () => props.followAnchorActive,
  (active) => {
    if (active) {
      anchoredScrollTop = null;
      scheduleConversationScrollToBottom();
    } else {
      anchoredScrollTop = null;
      if (autoFollowConversation.value) {
        scheduleConversationScrollToBottom();
      }
    }
  },
  { flush: "post" },
);

watch(
  conversationViewport,
  () => {
    bindConversationObserver();
    lastObservedScrollTop = conversationViewport.value?.scrollTop ?? 0;
    scheduleConversationScrollToBottom();
  },
  { flush: "post" },
);
</script>

<template>
  <div class="conversation-surface-card" :class="cardClass">
    <div
      v-if="title || hasSlot('headerMeta') || hasSlot('headerActions')"
      class="panel-header conversation-surface-header"
    >
      <div class="conversation-surface-heading">
        <h3 v-if="title" class="panel-title conversation-surface-title">{{ title }}</h3>
        <slot name="headerMeta"></slot>
      </div>
      <div v-if="hasSlot('headerActions')" class="conversation-surface-actions">
        <slot name="headerActions"></slot>
      </div>
    </div>

    <div
      ref="conversationViewport"
      class="conversation-viewport"
      :class="viewportClass"
      @scroll="handleConversationScroll"
    >
      <slot></slot>
    </div>

    <div v-if="hasSlot('footer')" class="conversation-surface-footer">
      <slot name="footer"></slot>
    </div>
  </div>
</template>
