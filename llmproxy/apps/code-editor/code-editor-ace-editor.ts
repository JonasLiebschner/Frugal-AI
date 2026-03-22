import type { Ref, ShallowRef } from "vue";
import { shallowRef, unref } from "vue";
import { loadAce, resolveAceLanguage, resolveAceMode } from "./code-editor-ace-core";
import type { AceEditor, AceLanguage } from "./code-editor-ace-core";

interface AceEditorOptions {
  readOnly: boolean;
  language?: AceLanguage;
  theme?: string;
  wrap?: boolean;
  fontSize?: number;
  highlightActiveLine?: boolean;
  highlightGutterLine?: boolean;
  showPrintMargin?: boolean;
  onCreate?: (instance: AceEditor) => void | Promise<void>;
}

export interface AceEditorInstance {
  editor: ShallowRef<AceEditor | undefined>;
  mount: (container: HTMLDivElement) => Promise<AceEditor | undefined>;
  setLanguage: (language: AceLanguage) => void;
  setTheme: (theme: string) => void;
  destroy: () => void;
}

export const createAceEditor = (options: AceEditorOptions): AceEditorInstance => {
  const editor = shallowRef<AceEditor>();
  let mountedContainer: HTMLDivElement | undefined;
  let language = resolveAceLanguage(options.language);

  const mount = async (container: HTMLDivElement) => {
    if (editor.value && mountedContainer === container) {
      return editor.value;
    }

    editor.value?.destroy();
    editor.value = undefined;
    mountedContainer = undefined;

    const ace = await loadAce();
    const instance = ace.edit(container, {
      fontSize: options.fontSize ?? 14,
      highlightActiveLine: options.highlightActiveLine ?? !options.readOnly,
      highlightGutterLine: options.highlightGutterLine ?? !options.readOnly,
      readOnly: options.readOnly,
      showPrintMargin: options.showPrintMargin ?? false,
      useWorker: false,
      wrap: options.wrap ?? true,
    });

    instance.session.setMode(resolveAceMode(language));
    instance.session.setUseWorker(false);
    instance.session.setTabSize(2);
    instance.session.setUseWrapMode(true);
    instance.renderer.setPadding(12);
    instance.renderer.setScrollMargin(12, 12, 0, 0);

    if (options.theme) {
      instance.setTheme(options.theme);
    }

    await options.onCreate?.(instance);

    mountedContainer = container;
    editor.value = instance;

    return editor.value;
  };

  const setLanguage = (newLanguage: AceLanguage) => {
    language = resolveAceLanguage(newLanguage);
    editor.value?.session.setMode(resolveAceMode(language));
  };

  const setTheme = (theme: string) => {
    editor.value?.setTheme(theme);
  };

  const destroy = () => {
    editor.value?.destroy();
    editor.value = undefined;
    mountedContainer = undefined;
  };

  return {
    destroy,
    editor,
    mount,
    setLanguage,
    setTheme,
  };
};

interface UseAceEditorOptions extends AceEditorOptions {
  container: Ref<HTMLDivElement | undefined>;
}

export const useAceEditor = (options: UseAceEditorOptions) => {
  const instance = createAceEditor(options);

  const ensureEditor = async () => {
    const container = unref(options.container);
    if (!container) {
      return;
    }

    return await instance.mount(container);
  };

  return {
    destroy: instance.destroy,
    editor: instance.editor,
    ensureEditor,
    setLanguage: instance.setLanguage,
    setTheme: instance.setTheme,
  };
};
