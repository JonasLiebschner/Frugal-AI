<script setup lang="ts">
import { computed } from "vue";
import type { BackendSnapshot } from "../types/dashboard";

const props = defineProps<{
  connector: BackendSnapshot["connector"];
}>();

const connectorClass = computed(() => {
  if (props.connector === "llama.cpp") {
    return "connector-badge-llamacpp";
  }

  return `connector-badge-${props.connector}`;
});

const connectorLabel = computed(() => {
  if (props.connector === "ollama") {
    return "Ollama";
  }

  if (props.connector === "llama.cpp") {
    return "llama.cpp";
  }

  return "OpenAI API";
});

const connectorTitle = computed(() => {
  if (props.connector === "ollama") {
    return "Ollama connector using the native Ollama API surface behind llmproxy.";
  }

  if (props.connector === "llama.cpp") {
    return "llama.cpp connector using the OpenAI-compatible server routes while preserving llama.cpp-specific sampler fields.";
  }

  return "OpenAI-compatible connector using the standard OpenAI API surface behind llmproxy.";
});
</script>

<template>
  <span
    :class="['badge', 'neutral', 'connector-badge', connectorClass]"
    :title="connectorTitle"
  >
    <svg
      v-if="connector === 'ollama'"
      class="connector-badge-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M8.2 6.2c0-1.5 1.2-2.7 2.7-2.7h2.2c1.5 0 2.7 1.2 2.7 2.7v1.3c1.8.8 3 2.6 3 4.7 0 3.1-2.2 5.6-5.1 6.1v1.2c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-1.2c-2.9-.5-5.1-3-5.1-6.1 0-2.1 1.2-3.9 3-4.7V6.2Z"
        fill="currentColor"
        fill-opacity="0.13"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <circle cx="9.7" cy="12" r="1.1" fill="currentColor" />
      <circle cx="14.3" cy="12" r="1.1" fill="currentColor" />
      <path
        d="M9.4 14.9c.8.8 1.7 1.2 2.6 1.2.9 0 1.8-.4 2.6-1.2"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <path d="M9 7.4V5.8M15 7.4V5.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
    <svg
      v-else-if="connector === 'llama.cpp'"
      class="connector-badge-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 18.5h12" />
        <path d="M8 18.5v-9.8c0-1.2 1-2.2 2.2-2.2h3.6c1.2 0 2.2 1 2.2 2.2v9.8" />
        <path d="M10.2 10.4h3.6" />
        <path d="M10.2 13.4h3.6" />
        <path d="M12 6.5V4.2" />
      </g>
    </svg>
    <svg
      v-else
      class="connector-badge-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 4.1c1.6 0 2.8 1.3 2.8 2.8v1.2l1-.6c1.4-.8 3.1-.3 3.9 1.1.8 1.4.3 3.1-1.1 3.9l-1 .6 1 .6c1.4.8 1.9 2.5 1.1 3.9-.8 1.4-2.5 1.9-3.9 1.1l-1-.6v1.2c0 1.6-1.3 2.8-2.8 2.8-1.6 0-2.8-1.3-2.8-2.8v-1.2l-1 .6c-1.4.8-3.1.3-3.9-1.1-.8-1.4-.3-3.1 1.1-3.9l1-.6-1-.6c-1.4-.8-1.9-2.5-1.1-3.9.8-1.4 2.5-1.9 3.9-1.1l1 .6V6.9c0-1.6 1.3-2.8 2.8-2.8Z" />
        <circle cx="12" cy="12" r="2.3" />
      </g>
    </svg>
    <span>{{ connectorLabel }}</span>
  </span>
</template>
