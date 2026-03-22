import assert from "node:assert/strict";
import test from "node:test";

import {
  hasStandaloneEmbeddedContent,
  hasVisibleMessageContent,
  renderDetailBlock,
  renderMessageContentHtml,
} from "../app/utils/message-content";

test("hasVisibleMessageContent treats strings, arrays, and nullish values consistently", () => {
  assert.equal(hasVisibleMessageContent("hello"), true);
  assert.equal(hasVisibleMessageContent(""), false);
  assert.equal(hasVisibleMessageContent([{ type: "text", text: "hello" }]), true);
  assert.equal(hasVisibleMessageContent([]), false);
  assert.equal(hasVisibleMessageContent(null), false);
});

test("hasStandaloneEmbeddedContent recognizes standalone JSON strings", () => {
  assert.equal(hasStandaloneEmbeddedContent("{\"hello\":true}"), true);
  assert.equal(hasStandaloneEmbeddedContent("plain text"), false);
});

test("renderMessageContentHtml renders structured content parts", () => {
  const html = renderMessageContentHtml([
    { type: "input_text", text: "Hello" },
    { type: "metadata", value: 1 },
  ]);

  assert.match(html, /message-part-list/);
  assert.match(html, /input_text/);
  assert.match(html, /metadata/);
});

test("renderDetailBlock hides empty values and renders populated ones", () => {
  assert.equal(renderDetailBlock("Audio", ""), "");

  const html = renderDetailBlock("Audio", { format: "wav" });
  assert.match(html, /detail-block-label/);
  assert.match(html, /Audio/);
  assert.match(html, /wav/);
});
