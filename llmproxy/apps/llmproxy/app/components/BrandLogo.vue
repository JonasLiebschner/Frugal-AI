<script setup lang="ts">
import BrandMark from "./BrandMark.vue";

const props = withDefaults(defineProps<{
  title?: string;
  compact?: boolean;
}>(), {
  title: "llmproxy",
  compact: false,
});
</script>

<template>
  <div class="brand-lockup" :class="{ compact: props.compact }">
    <span
      class="brand-mark"
      :class="{ compact: props.compact }"
      :title="props.title"
      role="img"
      :aria-label="props.title"
    >
      <BrandMark />
    </span>
  </div>
</template>
