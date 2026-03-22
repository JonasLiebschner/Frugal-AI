import assert from "node:assert/strict";
import test from "node:test";

import { renderMessageDetailBlocks } from "../app/utils/message-detail-blocks";

test("renderMessageDetailBlocks renders refusal and audio blocks", () => {
  const html = renderMessageDetailBlocks({
    refusal: "nope",
    audio: { format: "wav" },
  });

  assert.match(html, /Refusal/);
  assert.match(html, /Audio/);
  assert.match(html, /wav/);
});

test("renderMessageDetailBlocks renders structured function and tool calls", () => {
  const html = renderMessageDetailBlocks({
    function_call: {
      name: "legacy_call",
      arguments: "{\"ok\":true}",
    },
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: {
          name: "search",
          arguments: "{\"q\":\"hello\"}",
        },
      },
    ],
  });

  assert.match(html, /function-call-bubble/);
  assert.match(html, /legacy_call/);
  assert.match(html, /search/);
  assert.match(html, /call id: call_1/);
});

test("renderMessageDetailBlocks renders nothing for empty detail sections", () => {
  assert.equal(renderMessageDetailBlocks({}), "");
});
