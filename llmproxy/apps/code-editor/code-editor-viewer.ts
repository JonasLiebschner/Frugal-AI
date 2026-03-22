export {
  createCodeViewer,
  decodeCodeViewerPayload,
  encodeCodeViewerPayload,
  normalizeCodeViewerLanguage,
  serializeCodeViewerValue,
  type CodeViewerController,
  type CodeViewerLanguage,
} from "./code-editor-viewer-core";

export {
  createInlineCodeViewerFromContainer,
  findInlineCodeViewerContainers,
  INLINE_CODE_VIEWER_SELECTOR,
  renderInlineCodeViewerMarkup,
} from "./code-editor-inline-viewer";

export {
  createInlineCodeViewerRegistry,
  type InlineCodeViewerRegistry,
  type InlineCodeViewerRegistryOptions,
} from "./code-editor-inline-viewer-registry";

export { useCodeViewerResize, useInlineCodeViewers } from "./code-editor-vue";
