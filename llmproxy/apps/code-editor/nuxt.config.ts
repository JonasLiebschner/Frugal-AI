import { fileURLToPath } from "node:url";

const codeEditorCssPath = fileURLToPath(new URL("./app/assets/css/code-editor.css", import.meta.url));

export default defineNuxtConfig({
  compatibilityDate: "2024-09-06",
  css: [codeEditorCssPath],
});
