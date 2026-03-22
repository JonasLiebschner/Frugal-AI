import type { CodeViewerController, CodeViewerLanguage } from "./code-editor-viewer-core";
import {
  createCodeViewer,
  decodeCodeViewerPayload,
  encodeCodeViewerPayload,
  normalizeCodeViewerLanguage,
  serializeCodeViewerValue,
} from "./code-editor-viewer-core";

const INLINE_CODE_VIEWER_ATTRIBUTE = "data-inline-code-viewer";
const INLINE_CODE_VIEWER_LANGUAGE_ATTRIBUTE = "data-code-language";
const INLINE_CODE_VIEWER_SERIALIZED_ATTRIBUTE = "data-code-value-serialized";
const INLINE_CODE_VIEWER_HOST_CLASS = "inline-code-viewer-host";

export const INLINE_CODE_VIEWER_SELECTOR = `[${INLINE_CODE_VIEWER_ATTRIBUTE}="true"]`;

function escapeInlineCodeViewerHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function findInlineCodeViewerContainers(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(INLINE_CODE_VIEWER_SELECTOR));
}

export async function createInlineCodeViewerFromContainer(
  container: HTMLElement,
  options: {
    readOnly?: boolean;
    scrollPastEnd?: number;
    padding?: number;
  } = {},
): Promise<CodeViewerController | null> {
  const host = container.querySelector<HTMLElement>(`.${INLINE_CODE_VIEWER_HOST_CLASS}`);
  const payload = container.querySelector<HTMLScriptElement>('script[type="application/json"]');
  if (!host || !payload) {
    return null;
  }

  const language = normalizeCodeViewerLanguage(container.dataset.codeLanguage ?? "") ?? "json";
  const value = decodeCodeViewerPayload(payload.textContent ?? "");
  const valueIsSerialized = container.dataset.codeValueSerialized === "true";

  return await createCodeViewer(host, {
    value,
    valueIsSerialized,
    language,
    readOnly: options.readOnly ?? true,
    scrollPastEnd: options.scrollPastEnd ?? 0,
    padding: options.padding ?? 10,
  });
}

export function renderInlineCodeViewerMarkup(
  content: unknown,
  options: {
    language?: string;
    wrapperClass?: string;
    placeholder?: string;
  } = {},
): string {
  if (content === null || content === undefined || content === "") {
    return "";
  }

  const language = normalizeCodeViewerLanguage(options.language ?? "") ?? "json";
  const serialized = serializeCodeViewerValue(content, language, options.placeholder ?? "");
  if (!serialized) {
    return "";
  }

  const wrapperClass = options.wrapperClass?.trim() || "inline-code-viewer";

  return (
    `<div class="${escapeInlineCodeViewerHtml(wrapperClass)}" ` +
      `${INLINE_CODE_VIEWER_ATTRIBUTE}="true" ` +
      `${INLINE_CODE_VIEWER_LANGUAGE_ATTRIBUTE}="${escapeInlineCodeViewerHtml(language)}" ` +
      `${INLINE_CODE_VIEWER_SERIALIZED_ATTRIBUTE}="true">` +
      `<script type="application/json">${encodeCodeViewerPayload(serialized)}</script>` +
      `<div class="${INLINE_CODE_VIEWER_HOST_CLASS}"></div>` +
    `</div>`
  );
}
