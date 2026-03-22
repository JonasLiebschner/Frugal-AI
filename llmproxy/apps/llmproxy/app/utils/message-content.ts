import MarkdownIt from "markdown-it";

import {
  escapeHtml,
  renderCodeBlockHtml,
  renderCodeInnerBlock,
  normalizeCodeViewerLanguage,
} from "../../../code-editor/code-editor-client";
import { prettyJson } from "./formatters";
import { isClientRecord } from "./guards";
import { renderEmbeddedContentBubble } from "./message-compact-bubbles";

function renderMarkdownCodeFence(content: string, language: string): string {
  const codeLanguage = normalizeCodeViewerLanguage(language);
  if (codeLanguage) {
    return renderEmbeddedContentBubble(codeLanguage, content, renderMessageStringHtml);
  }

  const rendered = renderCodeInnerBlock(content);
  const codeClass = "turn-content" + (rendered.isJson || language === "json" ? " json-view" : "");
  return `<pre class="${escapeHtml(codeClass)}"><code>${rendered.html}</code></pre>`;
}

function createMarkdownRenderer(): MarkdownIt {
  const markdown = new MarkdownIt({
    html: false,
    breaks: false,
    linkify: true,
  });

  const defaultLinkOpen = markdown.renderer.rules.link_open;
  markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noreferrer noopener");
    return defaultLinkOpen ? defaultLinkOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  };

  const defaultTableOpen = markdown.renderer.rules.table_open;
  markdown.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    tokens[idx].attrJoin("class", "markdown-table");
    const rendered = defaultTableOpen ? defaultTableOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    return `<div class="markdown-table-wrap">${rendered}`;
  };

  const defaultTableClose = markdown.renderer.rules.table_close;
  markdown.renderer.rules.table_close = (tokens, idx, options, env, self) => {
    const rendered = defaultTableClose ? defaultTableClose(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    return `${rendered}</div>`;
  };

  markdown.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const language = token.info.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
    return renderMarkdownCodeFence(token.content, language);
  };

  markdown.renderer.rules.code_block = (tokens, idx) => (
    renderMarkdownCodeFence(tokens[idx].content, "")
  );

  return markdown;
}

const markdownRenderer = createMarkdownRenderer();

function renderMarkdownToHtml(markdown: unknown): string {
  const normalized = String(markdown ?? "").replace(/\r\n?/g, "\n").trim();

  if (!normalized) {
    return "";
  }

  return markdownRenderer.render(normalized);
}

export function renderMessageStringHtml(value: unknown, embedStandaloneJson = true): string {
  const rendered = renderCodeInnerBlock(value);
  if (rendered.isJson) {
    if (embedStandaloneJson) {
      return renderEmbeddedContentBubble("json", value, renderMessageStringHtml);
    }

    return renderCodeBlockHtml(value, "turn-content");
  }

  return `<div class="markdown-content">${renderMarkdownToHtml(value)}</div>`;
}

export function hasStandaloneEmbeddedContent(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  return renderCodeInnerBlock(value).isJson;
}

export function renderDetailBlock(label: string, value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  return (
    `<div class="detail-block">` +
      `<div class="detail-block-label">${escapeHtml(label)}</div>` +
      renderCodeBlockHtml(value, "turn-content") +
    `</div>`
  );
}

export function hasVisibleMessageContent(content: unknown): boolean {
  if (typeof content === "string") {
    return content.length > 0;
  }

  if (Array.isArray(content)) {
    return content.length > 0;
  }

  return content !== undefined && content !== null;
}

export function renderMessageContentHtml(content: unknown): string {
  if (typeof content === "string") {
    return renderMessageStringHtml(content);
  }

  if (Array.isArray(content)) {
    if (content.length === 0) {
      return "";
    }

    return (
      `<div class="message-part-list">` +
        content.map((part, index) => {
          const partType = isClientRecord(part) && typeof part.type === "string"
            ? part.type
            : `part ${index + 1}`;
          const displayValue =
            isClientRecord(part) && typeof part.text === "string"
              ? part.text
              : prettyJson(part);

          return (
            `<div class="message-part">` +
              `<div class="message-part-type">${escapeHtml(partType)}</div>` +
              renderMessageStringHtml(displayValue) +
            `</div>`
          );
        }).join("") +
      `</div>`
    );
  }

  if (content === null || content === undefined) {
    return "";
  }

  return renderDetailBlock("Content", content);
}
