<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  compact?: boolean;
}>(), {
  title: "Close",
  ariaLabel: "Close",
  disabled: false,
  compact: false,
});

const emit = defineEmits<{
  (event: "click"): void;
}>();
</script>

<template>
  <button
    :class="['icon-button', compact ? 'compact' : '']"
    type="button"
    :title="title"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @click="emit('click')"
  >
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M6 6L18 18" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
      <path d="M18 6L6 18" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
    </svg>
  </button>
</template>
