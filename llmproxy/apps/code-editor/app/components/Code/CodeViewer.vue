<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createCodeViewer } from "../../../code-editor-viewer-core";
import type { CodeViewerController, CodeViewerLanguage } from "../../../code-editor-viewer-core";

const props = withDefaults(defineProps<{
  value?: unknown;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: string;
  language?: CodeViewerLanguage;
}>(), {
  placeholder: "",
  readOnly: true,
  minHeight: "320px",
  language: "json",
});

const editorHost = ref<HTMLElement | null>(null);
let controller: CodeViewerController | null = null;
let disposed = false;

async function initializeEditor(): Promise<void> {
  if (!editorHost.value) {
    return;
  }

  try {
    controller = await createCodeViewer(editorHost.value, {
      value: props.value,
      language: props.language,
      placeholder: props.placeholder,
      readOnly: props.readOnly,
    });

    if (disposed) {
      controller.destroy();
      controller = null;
    }
  } catch (error) {
    console.error("Failed to initialize the code viewer.", error);
  }
}

onMounted(() => {
  void initializeEditor();
});

onBeforeUnmount(() => {
  disposed = true;
  controller?.destroy();
  controller = null;
});

function resize(): void {
  controller?.resize();
}

defineExpose({
  resize,
});

watch(() => [props.value, props.placeholder] as const, ([value, placeholder]) => {
  controller?.setValue(value, placeholder);
  controller?.resize();
});

watch(
  () => props.readOnly,
  (readOnly) => {
    controller?.setReadOnly(readOnly);
  },
);
</script>

<template>
  <div class="code-viewer" :style="{ '--code-viewer-min-height': props.minHeight }">
    <div ref="editorHost" class="code-viewer-editor"></div>
  </div>
</template>

<style scoped>
.code-viewer {
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  min-height: var(--code-viewer-min-height, 320px);
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(120, 53, 15, 0.12);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.9);
}

.code-viewer-editor {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: var(--code-viewer-min-height, 320px);
  overflow: hidden;
}

:deep(.code-viewer-editor.ace_editor),
.code-viewer-editor :deep(.ace_editor),
.code-viewer-editor :deep(.ace_scroller),
.code-viewer-editor :deep(.ace_content) {
  font-family: "IBM Plex Mono", "Consolas", monospace;
}

:deep(.code-viewer-editor.ace_editor),
.code-viewer-editor :deep(.ace_editor) {
  width: 100%;
  height: 100%;
  min-height: var(--code-viewer-min-height, 320px);
}

:deep(.code-viewer-editor.ace_editor .ace_gutter),
.code-viewer-editor :deep(.ace_gutter) {
  background: rgba(245, 245, 244, 0.92);
}

:deep(.code-viewer-editor.ace_editor .ace_fold-widget),
.code-viewer-editor :deep(.ace_fold-widget) {
  cursor: pointer;
}
</style>
