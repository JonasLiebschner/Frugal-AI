import type { Ace } from "ace-code";

export type AceLanguage =
  | "json"
  | "javascript"
  | "xml"
  | "html"
  | "css"
  | "typescript"
  | "yaml"
  | "markdown"
  | "python"
  | "sh";

const aceModeByLanguage: Record<AceLanguage, string> = {
  css: "ace/mode/css",
  html: "ace/mode/html",
  javascript: "ace/mode/javascript",
  json: "ace/mode/json",
  markdown: "ace/mode/markdown",
  python: "ace/mode/python",
  sh: "ace/mode/sh",
  typescript: "ace/mode/typescript",
  xml: "ace/mode/xml",
  yaml: "ace/mode/yaml",
};

const aceLanguageAliases: Record<string, AceLanguage> = {
  bash: "sh",
  css: "css",
  html: "html",
  javascript: "javascript",
  js: "javascript",
  json: "json",
  markdown: "markdown",
  md: "markdown",
  py: "python",
  python: "python",
  shell: "sh",
  sh: "sh",
  svg: "xml",
  ts: "typescript",
  typescript: "typescript",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "sh",
};

let aceLoader: Promise<typeof import("ace-code")> | undefined;

const registerAceModuleLoaders = async () => {
  if (!aceLoader) {
    aceLoader = import("ace-code").then((ace) => {
      const moduleLoaders: Record<string, () => Promise<unknown>> = {
        "ace/ext/searchbox": () => import("ace-code/src/ext/searchbox"),
        "ace/mode/css": () => import("ace-code/src/mode/css"),
        "ace/mode/folding/cstyle": () => import("ace-code/src/mode/folding/cstyle"),
        "ace/mode/folding/html": () => import("ace-code/src/mode/folding/html"),
        "ace/mode/folding/xml": () => import("ace-code/src/mode/folding/xml"),
        "ace/mode/html": () => import("ace-code/src/mode/html"),
        "ace/mode/javascript": () => import("ace-code/src/mode/javascript"),
        "ace/mode/json": () => import("ace-code/src/mode/json"),
        "ace/mode/markdown": () => import("ace-code/src/mode/markdown"),
        "ace/mode/python": () => import("ace-code/src/mode/python"),
        "ace/mode/sh": () => import("ace-code/src/mode/sh"),
        "ace/mode/typescript": () => import("ace-code/src/mode/typescript"),
        "ace/mode/xml": () => import("ace-code/src/mode/xml"),
        "ace/mode/yaml": () => import("ace-code/src/mode/yaml"),
        "ace/theme/chrome": () => import("ace-code/src/theme/chrome"),
        "ace/theme/dracula": () => import("ace-code/src/theme/dracula"),
        "ace/theme/textmate": () => import("ace-code/src/theme/textmate"),
      };

      Object.entries(moduleLoaders).forEach(([moduleId, loader]) => {
        ace.config.setModuleLoader(moduleId, loader);
      });

      return ace;
    });
  }

  return aceLoader;
};

export const tryResolveAceLanguage = (language?: unknown): AceLanguage | null => {
  const normalized = typeof language === "string" ? language.trim().toLowerCase() : "";
  if (!normalized) {
    return null;
  }

  return aceLanguageAliases[normalized] ?? null;
};

export const resolveAceLanguage = (language?: unknown): AceLanguage => {
  return tryResolveAceLanguage(language) ?? "json";
};

export const resolveAceMode = (language?: unknown): string => {
  return aceModeByLanguage[resolveAceLanguage(language)];
};

export const loadAce = async (): Promise<typeof import("ace-code")> => {
  return await registerAceModuleLoaders();
};

export const formatJson = (value: string): string => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

export type AceEditor = Ace.Editor;
