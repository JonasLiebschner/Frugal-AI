import { escapeHtml } from "../../../code-editor/code-editor-client";
import type { RenderMessageOptions, UiBadge } from "../types/dashboard";
import { formatUiValue } from "./formatters";
import {
  renderPendingAssistantIndicator,
  renderPendingToolBubble,
  renderReasoningBubble,
  renderToolResponseBubble,
} from "./message-compact-bubbles";
import {
  renderMessageContentHtml,
  renderMessageStringHtml,
} from "./message-content";
import { renderMessageDetailBlocks } from "./message-detail-blocks";
import { buildMessageMetaBadges } from "./message-meta-badges";
import { buildMessageTurnClassName, getMessageRenderState } from "./message-render-state";

export function renderMessageHtml(message: Record<string, any>, index: number, options: RenderMessageOptions = {}): string {
  const role = typeof message?.role === "string" ? message.role : (options.role ?? "unknown");
  const state = getMessageRenderState(message, role, options);
  const metaBits: UiBadge[] = buildMessageMetaBadges(message, role, options);

  const hasHead = Boolean(options.heading) || metaBits.length > 0;

  return (
    `<article class="${escapeHtml(buildMessageTurnClassName(role, state))}">` +
      (hasHead
        ? (
          `<div class="turn-head">` +
            (options.heading
              ? `<span class="turn-role">${escapeHtml(options.heading)}</span>`
              : "") +
            `<div class="message-meta">` +
              metaBits.map((bit) => (
                `<span class="badge ${escapeHtml(bit.tone ?? "neutral")}" title="${escapeHtml(bit.title ?? "")}">${escapeHtml(bit.text)}</span>`
              )).join("") +
            `</div>` +
          `</div>`
        )
        : "") +
      renderReasoningBubble(message?.reasoning_content, options.reasoningCollapsed ?? true, state.reasoningLive, renderMessageStringHtml) +
      (state.pendingAssistantOnly
        ? renderPendingAssistantIndicator(typeof message?.pending_title === "string" ? message.pending_title : "")
        : state.pendingToolOnly
        ? renderPendingToolBubble(
            typeof message?.name === "string" ? message.name : "",
            typeof message?.tool_call_id === "string" ? message.tool_call_id : "",
            typeof message?.pending_title === "string" ? message.pending_title : "",
          )
        : ((state.hasContent || !message?.reasoning_content)
        ? (role === "tool"
          ? renderToolResponseBubble(
              message?.content,
              true,
              typeof message?.name === "string" ? message.name : "",
              typeof message?.tool_call_id === "string" ? message.tool_call_id : "",
            )
          : renderMessageContentHtml(message?.content))
        : "")) +
      renderMessageDetailBlocks(message) +
    `</article>`
  );
}

export function renderTextValue(value: unknown): string {
  return formatUiValue(value);
}
