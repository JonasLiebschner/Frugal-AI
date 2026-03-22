<script setup lang="ts">
import type { PropType } from "vue";

interface SuggestionActionItem {
  key: string;
  title: string;
  description: string;
  active?: boolean;
  highlighted?: boolean;
  badgeText?: string;
}

defineProps({
  items: {
    type: Array as PropType<SuggestionActionItem[]>,
    required: true,
  },
  showHighlightedBadge: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits<{
  select: [key: string];
}>();
</script>

<template>
  <div class="diagnostics-actions">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="diagnostics-action-card"
      :class="{ active: item.active, recommended: item.highlighted }"
      @click="emit('select', item.key)"
    >
      <div class="diagnostics-action-title">
        {{ item.title }}
        <span
          v-if="item.highlighted && showHighlightedBadge"
          class="diagnostics-action-badge"
        >{{ item.badgeText || "Suggested" }}</span>
      </div>
      <div v-if="item.description" class="diagnostics-action-description">{{ item.description }}</div>
    </button>
  </div>
</template>
