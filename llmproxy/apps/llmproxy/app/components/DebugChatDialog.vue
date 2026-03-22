<script setup lang="ts">
import DebugChatFrame from "./DebugChatFrame.vue";
import { useDashboardStore } from "../composables/useDashboardStore";

const store = useDashboardStore();
</script>

<template>
  <DebugChatFrame
    :open="store.state.debug.dialogOpen"
    show-close-button
    heading-id="debug-chat-dialog-title"
    @close="store.closeDebugChatDialog()"
  />
</template>
