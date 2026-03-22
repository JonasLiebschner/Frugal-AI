import {
  escapeHtml,
  renderInlineCodeViewerMarkup,
} from "../../../code-editor/code-editor-client";

type RenderMessageStringHtml = (value: unknown, embedStandaloneJson?: boolean) => string;

type CompactBubbleDisclosureOptions = {
  kindClass: string;
  contentClass: string;
  iconClass: string;
  iconHtml: string;
  labelText?: string;
  labelTitle?: string;
  bodyHtml: string;
  collapsed: boolean;
  collapsedTitle: string;
  expandedTitle: string;
  extraRootClasses?: string[];
  allowEmptyBody?: boolean;
};

type CompactBubbleStaticOptions = {
  kindClass: string;
  iconClass: string;
  iconHtml: string;
  labelText?: string;
  labelTitle?: string;
  trailingHtml?: string;
  extraRootClasses?: string[];
};

function renderCompactBubbleIconHtml(iconClass: string, iconHtml: string): string {
  if (!iconHtml.trim()) {
    return "";
  }

  return (
    `<span class="compact-bubble-icon ${escapeHtml(iconClass)}" aria-hidden="true">` +
      iconHtml +
    `</span>`
  );
}

function renderCompactBubbleDisclosure(options: CompactBubbleDisclosureOptions): string {
  if (!options.bodyHtml && !options.allowEmptyBody) {
    return "";
  }

  const rootClasses = [
    "compact-bubble-panel",
    options.kindClass,
    ...(options.extraRootClasses ?? []),
  ].filter(Boolean).join(" ");

  return (
    `<details class="${escapeHtml(rootClasses)}"${options.collapsed ? "" : " open"}>` +
      `<summary class="compact-bubble-summary" title="${escapeHtml(
        options.collapsed ? options.collapsedTitle : options.expandedTitle,
      )}">` +
        renderCompactBubbleIconHtml(options.iconClass, options.iconHtml) +
        (options.labelText
          ? `<span class="compact-bubble-label"${options.labelTitle ? ` title="${escapeHtml(options.labelTitle)}"` : ""}>${escapeHtml(options.labelText)}</span>`
          : "") +
        `<span class="compact-bubble-chevron" aria-hidden="true"></span>` +
      `</summary>` +
      (options.bodyHtml
        ? (
          `<div class="compact-bubble-content ${escapeHtml(options.contentClass)}">` +
            options.bodyHtml +
          `</div>`
        )
        : "") +
    `</details>`
  );
}

function renderCompactBubbleStatic(options: CompactBubbleStaticOptions): string {
  const rootClasses = [
    "compact-bubble-panel",
    options.kindClass,
    "compact-bubble-static",
    ...(options.extraRootClasses ?? []),
  ].filter(Boolean).join(" ");

  return (
    `<div class="${escapeHtml(rootClasses)}">` +
      `<div class="compact-bubble-summary compact-bubble-summary-static">` +
        renderCompactBubbleIconHtml(options.iconClass, options.iconHtml) +
        (options.labelText
          ? `<span class="compact-bubble-label"${options.labelTitle ? ` title="${escapeHtml(options.labelTitle)}"` : ""}>${escapeHtml(options.labelText)}</span>`
          : "") +
        (options.trailingHtml ?? "") +
      `</div>` +
    `</div>`
  );
}

function renderLiveReasoningContentHtml(reasoningContent: string): string {
  return (
    `<div class="reasoning-stream-content">` +
      escapeHtml(reasoningContent).replace(/\n/g, "<br />") +
    `</div>`
  );
}

function renderEmbeddedContentIconHtml(): string {
  return (
    `<span class="embedded-content-icon" aria-hidden="true">` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M8 4.75h6l4 4v10.5a1.75 1.75 0 0 1-1.75 1.75H8A1.75 1.75 0 0 1 6.25 19.25V6.5A1.75 1.75 0 0 1 8 4.75Z"></path>` +
        `<path d="M14 4.75V9h4"></path>` +
      `</svg>` +
    `</span>`
  );
}

function renderToolCallIconHtml(): string {
  return (
    `<span class="tool-flow-icon" aria-hidden="true">` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M14.8 4.9a3.5 3.5 0 0 0 4.3 4.3l-4.9 4.9a2.3 2.3 0 0 1-3.25 0l-.85-.85a2.3 2.3 0 0 1 0-3.25Z"></path>` +
        `<path d="m9.9 14.1-3.7 3.7"></path>` +
        `<path d="M5.5 18.4 4.4 19.5"></path>` +
        `<path d="M15.1 8.9 18.8 5.2"></path>` +
        `<circle cx="8.35" cy="15.65" r="0.85" fill="currentColor" stroke="none"></circle>` +
      `</svg>` +
    `</span>`
  );
}

function renderToolReturnIconHtml(): string {
  return renderToolCallIconHtml();
}

function renderToolPayloadBubble(options: {
  bodyHtml: string;
  collapsed: boolean;
  labelText: string;
  labelTitle?: string;
  iconHtml: string;
  collapsedTitle: string;
  expandedTitle: string;
  kindClass?: string;
  contentClass?: string;
  iconClass?: string;
  extraRootClasses?: string[];
}): string {
  if (!options.bodyHtml) {
    return renderCompactBubbleStatic({
      kindClass: options.kindClass ?? "compact-bubble-panel-tool",
      iconClass: options.iconClass ?? "tool-response-icon",
      iconHtml: options.iconHtml,
      labelText: options.labelText,
      labelTitle: options.labelTitle,
      extraRootClasses: options.extraRootClasses ?? ["compact-bubble-static-tool"],
    });
  }

  return renderCompactBubbleDisclosure({
    kindClass: options.kindClass ?? "compact-bubble-panel-tool",
    contentClass: options.contentClass ?? "tool-response-content",
    iconClass: options.iconClass ?? "tool-response-icon",
    iconHtml: options.iconHtml,
    labelText: options.labelText,
    labelTitle: options.labelTitle,
    bodyHtml: options.bodyHtml,
    collapsed: options.collapsed,
    collapsedTitle: options.collapsedTitle,
    expandedTitle: options.expandedTitle,
    extraRootClasses: options.extraRootClasses,
  });
}

function parseStructuredArguments(value: unknown): unknown {
  let current = value;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (typeof current !== "string") {
      return current;
    }

    const trimmed = current.trim();
    if (!trimmed) {
      return current;
    }

    try {
      current = JSON.parse(trimmed);
    } catch {
      return current;
    }
  }

  return current;
}

function hasInvocationPayload(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  return true;
}

export function renderReasoningBubble(
  reasoningContent: unknown,
  collapsed: boolean,
  live: boolean,
  renderMessageStringHtml: RenderMessageStringHtml,
): string {
  if (typeof reasoningContent !== "string" || reasoningContent.length === 0) {
    return "";
  }

  const bodyHtml = collapsed
    ? ""
    : (live ? renderLiveReasoningContentHtml(reasoningContent) : renderMessageStringHtml(reasoningContent));

  return (
    `<div class="compact-bubble-panel compact-bubble-panel-reasoning${live ? " reasoning-live" : ""}${collapsed ? "" : " is-open"}">` +
      `<button type="button" class="compact-bubble-summary compact-bubble-summary-button" title="${escapeHtml(
        collapsed
          ? "Model reasoning captured for this message. Expand it to inspect the reasoning output."
          : "Model reasoning captured for this message. Collapse it to focus on the final content.",
      )}">` +
        `<span class="compact-bubble-icon reasoning-icon" aria-hidden="true">` +
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
            `<path d="M9 7.5a3 3 0 0 1 5.2-2.05A3.2 3.2 0 0 1 19 8.1c0 1.08-.44 2.06-1.16 2.77.75.58 1.23 1.49 1.23 2.51A3.12 3.12 0 0 1 15.95 16.5H15.5a2.5 2.5 0 0 1-4.78.72A2.8 2.8 0 0 1 8.5 18a3 3 0 0 1-2.96-3.43 3.02 3.02 0 0 1-1.54-2.63c0-1.03.5-1.94 1.27-2.52A3.17 3.17 0 0 1 5 8.1a3.2 3.2 0 0 1 4-3.09"></path>` +
            `<path d="M10.5 8.75v6.5"></path>` +
            `<path d="M13.5 8.75v6.5"></path>` +
            `<path d="M8.5 10.5h2"></path>` +
            `<path d="M13.5 10.5h2"></path>` +
          `</svg>` +
        `</span>` +
        `<span class="compact-bubble-chevron" aria-hidden="true"></span>` +
      `</button>` +
      (bodyHtml
        ? (
          `<div class="compact-bubble-content reasoning-content">` +
            bodyHtml +
          `</div>`
        )
        : "") +
    `</div>`
  );
}

export function renderToolResponseBubble(
  content: unknown,
  collapsed: boolean,
  toolName: string,
  toolCallId: string,
): string {
  return renderToolPayloadBubble({
    bodyHtml: renderInlineCodeViewerMarkup(content, { language: "json" }),
    collapsed,
    labelText: toolName || "Tool response",
    labelTitle: toolCallId ? `Tool call id: ${toolCallId}` : "",
    iconHtml: renderToolReturnIconHtml(),
    collapsedTitle: "Tool response captured for this message. Expand it to inspect the returned payload.",
    expandedTitle: "Tool response captured for this message. Collapse it to focus on the conversation flow.",
  });
}

export function renderPendingAssistantIndicator(title: string): string {
  return (
    `<div class="chat-loading-indicator"${title ? ` title="${escapeHtml(title)}"` : ""}>` +
      `<span class="chat-loading-spinner" aria-hidden="true"></span>` +
    `</div>`
  );
}

export function renderEmbeddedContentBubble(
  language: string,
  content: unknown,
  renderMessageStringHtml: RenderMessageStringHtml,
): string {
  const bodyHtml = language === "markdown"
    ? renderMessageStringHtml(content, false)
    : renderInlineCodeViewerMarkup(content, {
        language,
        wrapperClass: "inline-code-viewer embedded-inline-code-viewer",
      });

  return renderToolPayloadBubble({
    bodyHtml,
    collapsed: true,
    labelText: language,
    iconHtml: renderEmbeddedContentIconHtml(),
    kindClass: "compact-bubble-panel-embedded",
    contentClass: "embedded-content",
    iconClass: "embedded-content-icon-shell",
    extraRootClasses: ["compact-bubble-static-embedded"],
    collapsedTitle: `Embedded ${language} block. Expand it to inspect the content.`,
    expandedTitle: `Embedded ${language} block. Collapse it to focus on the surrounding message.`,
  });
}

export function renderPendingToolBubble(toolName: string, toolCallId: string, title: string): string {
  return renderCompactBubbleStatic({
    kindClass: "compact-bubble-panel-tool",
    iconClass: "tool-response-icon",
    iconHtml: renderToolReturnIconHtml(),
    labelText: toolName || "Tool response",
    labelTitle: toolCallId ? `Tool call id: ${toolCallId}` : undefined,
    trailingHtml: `<span class="chat-loading-spinner compact-bubble-inline-spinner compact-bubble-trailing-spinner" aria-hidden="true"></span>`,
    extraRootClasses: ["compact-bubble-static-tool", "compact-bubble-pending-tool"],
  }).replace(
    '<div class="compact-bubble-summary compact-bubble-summary-static">',
    `<div class="compact-bubble-summary compact-bubble-summary-static"${title ? ` title="${escapeHtml(title)}"` : ""}>`,
  );
}

export function renderFunctionInvocationHtml(
  label: string,
  payload: Record<string, any>,
  options: { id?: string; type?: string; note?: string } = {},
): string {
  const name =
    typeof payload.name === "string" && payload.name.trim().length > 0
      ? payload.name.trim()
      : label;
  const hoverDetails = [
    options.id ? `call id: ${options.id}` : "",
    options.type && options.type !== "function" ? `type: ${options.type}` : "",
  ].filter(Boolean).join("\n");
  const argumentsValue = parseStructuredArguments(payload.arguments);
  const rawArgumentsHtml = hasInvocationPayload(argumentsValue)
    ? renderInlineCodeViewerMarkup(argumentsValue, { language: "json" })
    : "";

  return renderToolPayloadBubble({
    bodyHtml: rawArgumentsHtml,
    collapsed: true,
    labelText: name,
    labelTitle: hoverDetails || undefined,
    iconHtml: renderToolCallIconHtml(),
    extraRootClasses: ["function-call-bubble"],
    collapsedTitle: "Tool call captured for this assistant message. Expand it to inspect the sent arguments.",
    expandedTitle: "Tool call captured for this assistant message. Collapse it to focus on the conversation flow.",
  });
}
