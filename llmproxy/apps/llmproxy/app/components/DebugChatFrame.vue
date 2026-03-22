<script setup lang="ts">
import { useDialogEscape } from "../composables/useDialogEscape";
import DebugChatWorkspace from "./DebugChatWorkspace.vue";

const props = withDefaults(defineProps<{
  open: boolean;
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  headingId?: string;
}>(), {
  showCloseButton: false,
  closeOnBackdrop: true,
  headingId: "debug-chat-dialog-title",
});

const emit = defineEmits<{
  close: [];
}>();

function handleBackdropClick(): void {
  if (!props.closeOnBackdrop) {
    return;
  }

  emit("close");
}

useDialogEscape(
  () => props.open,
  () => emit("close"),
);
</script>

<template>
  <div
    v-if="open"
    class="debug-chat-overlay"
    @click.self="handleBackdropClick"
  >
    <div class="debug-chat-dialog" role="dialog" aria-modal="true" :aria-labelledby="headingId">
      <DebugChatWorkspace
        :show-close-button="showCloseButton"
        :heading-id="headingId"
        @close="emit('close')"
      />
    </div>
  </div>
</template>
