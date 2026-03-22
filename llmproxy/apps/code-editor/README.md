# code-editor

Shared Ace editor layer with reusable code editor utilities and wrappers.

## Routes

This app does not provide HTTP routes.

## Public surface

- `code-editor/code-editor-client.ts`
  - top-level public client surface for plain module imports across app boundaries
- `code-editor/code-editor-ace.ts`
  - shared Ace loader based on `ace-code`
  - language normalization and mode resolution
- `code-editor/code-editor-viewer.ts`
  - imperative code viewer helpers for read-only Ace rendering
  - shared payload encoding and value serialization helpers
- `code-editor/code-editor-rendering.ts`
  - tiny browser paint scheduling helpers shared by code-editor composables and viewer setup
  - shared HTML rendering helpers for syntax-highlighted JSON and plain code blocks
  - shared HTML markup and DOM bootstrapping helpers for embedded inline code viewers
  - shared lifecycle helpers for mounting, refreshing, and destroying inline code viewers inside app-specific hosts
- `code-editor/code-editor-viewer.ts`
  - Vue-facing wrapper around inline viewer lifecycle, `nextTick`, and resize scheduling
  - Vue-facing helper for deferred `CodeViewer` resize after tab or layout changes
- `code-editor/app/assets/css/code-editor.css`
  - shared inline code viewer styling for the underlying editor DOM
- `code-editor/app/components/Code/CodeEditor.vue`
  - reusable code editor component with JSON-aware formatting support
- `code-editor/app/components/Code/CodeViewer.vue`
  - reusable read-only code viewer component

## Integration

- Add the `code-editor` layer to the host `extends` chain before apps that consume it.
- In Nuxt layer consumers, prefer auto-imported composables and auto-registered
  components such as `useCodeViewerResize`, `useInlineCodeViewers`, and `CodeViewer`.
- For utility modules, prefer the public Nuxt `#imports` surface where available
  instead of importing deep implementation paths from another app.
- For plain module imports, prefer `code-editor/code-editor-client.ts` instead
  of reaching into `app/utils/*` or `app/composables/*`.
- Use the `language` prop on `CodeEditor` to switch between supported Ace modes.
