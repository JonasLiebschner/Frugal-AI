import { formatJson, loadAce, resolveAceMode, tryResolveAceLanguage } from "./code-editor-ace-core";
import type { AceLanguage } from "./code-editor-ace-core";
import { waitForAnimationFrame } from "./code-editor-browser-paint";

type AceModule = typeof import("ace-code");

export type CodeViewerLanguage = AceLanguage;

export type CodeViewerController = {
  destroy: () => void;
  resize: () => void;
  setReadOnly: (readOnly: boolean) => void;
  setValue: (value: unknown, placeholder?: string) => void;
};

export function normalizeCodeViewerLanguage(value: string): CodeViewerLanguage | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return tryResolveAceLanguage(normalized);
}

function shouldUseJsonFormatting(language: CodeViewerLanguage): boolean {
  return language === "json";
}

export function serializeCodeViewerValue(
  value: unknown,
  language: CodeViewerLanguage,
  placeholder = "",
): string {
  if (value === undefined || value === null || value === "") {
    return placeholder;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return placeholder;
    }

    if (shouldUseJsonFormatting(language) && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
      return formatJson(value);
    }

    return value;
  }

  return JSON.stringify(value, null, 2);
}

export function encodeCodeViewerPayload(value: string): string {
  return encodeURIComponent(value);
}

export function decodeCodeViewerPayload(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function shouldUseAceWorker(): boolean {
  return false;
}

async function loadAceModule(): Promise<AceModule> {
  return await loadAce();
}

export async function createCodeViewer(
  host: HTMLElement,
  options: {
    value?: unknown;
    language?: CodeViewerLanguage;
    placeholder?: string;
    readOnly?: boolean;
    minLines?: number;
    maxLines?: number;
    scrollPastEnd?: number;
    padding?: number;
    valueIsSerialized?: boolean;
  } = {},
): Promise<CodeViewerController> {
  const ace = await loadAceModule();
  const language = options.language ?? "json";
  const readOnly = options.readOnly ?? true;
  const mode = resolveAceMode(language);

  const editor = ace.edit(host, {
    displayIndentGuides: true,
    fixedWidthGutter: true,
    fontSize: 14,
    highlightActiveLine: false,
    highlightGutterLine: false,
    maxLines: options.maxLines,
    minLines: options.minLines,
    mode,
    readOnly,
    scrollPastEnd: options.scrollPastEnd ?? 0.25,
    showFoldWidgets: true,
    showGutter: true,
    showPrintMargin: false,
    tabSize: 2,
    theme: "ace/theme/textmate",
    useSoftTabs: true,
    useWorker: shouldUseAceWorker(),
    wrap: true,
  });

  editor.session.setMode(mode);
  editor.session.setUseWorker(shouldUseAceWorker());
  editor.session.setUseWrapMode(true);
  editor.session.setFoldStyle("markbeginend");
  editor.renderer.setScrollMargin(0, 12, 12, 12);
  editor.renderer.setPadding(options.padding ?? 12);

  const initialValue =
    options.valueIsSerialized && typeof options.value === "string"
      ? options.value
      : serializeCodeViewerValue(options.value, language, options.placeholder ?? "");
  editor.setValue(initialValue, -1);
  editor.clearSelection();

  let resizeObserver: ResizeObserver | null = null;

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      editor.resize();
    });
    resizeObserver.observe(host);
  }

  void waitForAnimationFrame().then(() => {
    editor.resize();
  });

  return {
    destroy() {
      resizeObserver?.disconnect();
      resizeObserver = null;
      editor.destroy();
    },
    resize() {
      editor.resize();
    },
    setReadOnly(nextReadOnly: boolean) {
      editor.setReadOnly(nextReadOnly);
      editor.session.setUseWorker(shouldUseAceWorker());
    },
    setValue(value: unknown, placeholder = "") {
      const nextValue = serializeCodeViewerValue(value, language, placeholder);
      if (editor.getValue() === nextValue) {
        return;
      }

      editor.setValue(nextValue, -1);
      editor.clearSelection();
    },
  };
}
