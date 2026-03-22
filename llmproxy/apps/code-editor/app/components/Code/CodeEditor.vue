<template>
  <div
    ref="editorContainer"
    class="h-full min-h-[320px] w-full"
  />
</template>

<script setup lang="ts">
import { waitForDomPaint } from "../../../code-editor-browser-paint";
import { formatJson, resolveAceLanguage } from "../../../code-editor-ace-core";
import type { AceLanguage } from "../../../code-editor-ace-core";
import { useAceEditor } from "../../../code-editor-ace-editor";

const props = withDefaults(defineProps<{
  content: string | Record<string, unknown>;
  readOnly?: boolean;
  theme?: "light" | "dark";
  language?: AceLanguage;
}>(), {
  readOnly: false,
});

const emit = defineEmits<{
  contentUpdated: [content: Record<string, unknown> | string];
  error: [message: unknown];
}>();

const editorContainer = ref<HTMLDivElement>();
const language = computed(() => resolveAceLanguage(props.language));
const aceTheme = computed(() => props.theme === "light" ? "ace/theme/chrome" : "ace/theme/dracula");

const contentStr = computed(() => {
  if (language.value !== "json") {
    return typeof props.content === "string" ? props.content : JSON.stringify(props.content, null, 2);
  }

  if (typeof props.content === "string") {
    return formatJson(props.content);
  }

  return JSON.stringify(props.content, null, 2);
});

let updateTimer: ReturnType<typeof setTimeout> | undefined;

const applyEditorChange = (value: string) => {
  if (language.value !== "json") {
    emit("contentUpdated", value);
    return;
  }

  try {
    emit("contentUpdated", value ? JSON.parse(value) : {});
  } catch (error) {
    emit("error", error);
  }
};

const { ensureEditor, setLanguage: setAceLanguage, setTheme, destroy: destroyEditor } = useAceEditor({
  container: editorContainer,
  highlightActiveLine: false,
  highlightGutterLine: false,
  language: language.value,
  onCreate: (instance) => {
    instance.setTheme(aceTheme.value);
    instance.session.on("change", () => {
      if (updateTimer) {
        clearTimeout(updateTimer);
      }

      updateTimer = setTimeout(() => {
        applyEditorChange(instance.getValue());
      }, 150);
    });
  },
  readOnly: props.readOnly,
});

const updateContent = async (value: string) => {
  const instance = await ensureEditor();
  if (!instance) {
    return;
  }

  const formatted = language.value === "json" ? formatJson(value) : value;
  if (instance.getValue() !== formatted) {
    instance.setValue(formatted, -1);
    instance.clearSelection();
  }

  await waitForDomPaint();
  instance.resize();
};

watch(() => props.theme, () => {
  setTheme(aceTheme.value);
});

watch(language, (value) => {
  setAceLanguage(value);
});

watch(() => contentStr.value, (value) => {
  if (value === undefined || value === null) {
    return;
  }

  void updateContent(value);
}, { immediate: true });

onBeforeUnmount(() => {
  if (updateTimer) {
    clearTimeout(updateTimer);
  }

  destroyEditor();
});
</script>
