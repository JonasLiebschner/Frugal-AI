import assert from "node:assert/strict";
import test from "node:test";

import { renderToolsHtml } from "../app/utils/message-tool-definitions";

test("renderToolsHtml renders empty state for missing tool definitions", () => {
  assert.equal(
    renderToolsHtml([]),
    '<div class="empty">No tools were included in this request.</div>',
  );
});

test("renderToolsHtml renders function tools with schema-derived parameter metadata", () => {
  const html = renderToolsHtml([{
    type: "function",
    function: {
      name: "route_query",
      description: "Choose the correct model tier.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "User input to classify.",
            minLength: 1,
          },
          attempt: {
            type: "integer",
            description: "Optional retry counter.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  }]);

  assert.match(html, /route_query/);
  assert.match(html, /Choose the correct model tier\./);
  assert.match(html, /strict/);
  assert.match(html, /query/);
  assert.match(html, /required/);
  assert.match(html, /attempt/);
  assert.match(html, /optional/);
});

test("renderToolsHtml renders stored payload fallback for non-record tool entries", () => {
  const html = renderToolsHtml(["raw-payload"]);

  assert.match(html, /Stored tool payload/);
  assert.match(html, /raw-payload/);
});
