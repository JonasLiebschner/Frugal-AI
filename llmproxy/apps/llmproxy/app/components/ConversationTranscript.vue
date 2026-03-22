<script setup lang="ts">
import MessageCard from "./MessageCard.vue";
import type { ConversationTranscriptItem } from "../types/dashboard";

withDefaults(defineProps<{
  items: ConversationTranscriptItem[];
  emptyText: string;
  bubbleLayout?: boolean;
}>(), {
  bubbleLayout: false,
});
</script>

<template>
  <div v-if="items.length" class="transcript" :class="{ 'conversation-bubble-transcript': bubbleLayout }">
    <MessageCard
      v-for="item in items"
      :key="item.key"
      :item-key="item.key"
      :message="item.message"
      :index="item.index"
      :bubble-layout="bubbleLayout"
      :finish-reason="item.finishReason || ''"
      :hide-finish-badge="item.hideFinishBadge ?? false"
      :reasoning-collapsed="item.reasoningCollapsed ?? true"
      :extra-badges="item.extraBadges || []"
    />
  </div>
  <div v-else class="empty">{{ emptyText }}</div>
</template>
