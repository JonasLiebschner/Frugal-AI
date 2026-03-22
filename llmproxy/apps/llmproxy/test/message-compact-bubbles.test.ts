import assert from "node:assert/strict";
import test from "node:test";

import {
  renderEmbeddedContentBubble,
  renderFunctionInvocationHtml,
  renderPendingAssistantIndicator,
} from "../app/utils/message-compact-bubbles";

const renderMessageStringHtml = (value: unknown) => `<div class="markdown">${String(value ?? "")}</div>`;

test("renderEmbeddedContentBubble uses the provided markdown renderer for markdown blocks", () => {
  const html = renderEmbeddedContentBubble("markdown", "# Heading", renderMessageStringHtml);

  assert.match(html, /Embedded markdown block/);
  assert.match(html, /class="markdown"/);
  assert.match(html, /Heading/);
});

test("renderFunctionInvocationHtml renders parsed JSON arguments in a compact payload bubble", () => {
  const html = renderFunctionInvocationHtml("Tool Call 1", {
    name: "classifyQuery",
    arguments: "{\"query\":\"What is the capital of France?\"}",
  }, {
    id: "call-1",
  });

  assert.match(html, /classifyQuery/);
  assert.match(html, /call id: call-1/);
  assert.match(html, /query/);
});

test("renderPendingAssistantIndicator attaches an optional title", () => {
  const html = renderPendingAssistantIndicator("Waiting for upstream");

  assert.match(html, /chat-loading-indicator/);
  assert.match(html, /Waiting for upstream/);
});
