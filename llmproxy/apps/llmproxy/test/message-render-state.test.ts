import assert from "node:assert/strict";
import test from "node:test";

import { buildMessageTurnClassName, getMessageRenderState } from "../app/utils/message-render-state";

test("getMessageRenderState detects compact tool responses", () => {
  const state = getMessageRenderState(
    {
      role: "tool",
      content: "done",
      name: "search",
      tool_call_id: "call_1",
    },
    "tool",
  );

  assert.equal(state.toolResponseOnly, true);
  assert.equal(state.pendingToolOnly, false);
  assert.match(buildMessageTurnClassName("tool", state), /compact-bubble-only/);
  assert.match(buildMessageTurnClassName("tool", state), /tool-response-only/);
});

test("getMessageRenderState detects assistant tool call stacks", () => {
  const state = getMessageRenderState(
    {
      role: "assistant",
      tool_calls: [{ id: "a" }, { id: "b" }],
    },
    "assistant",
  );

  assert.equal(state.toolCallOnly, true);
  assert.equal(state.compactAssistantStackOnly, true);
  assert.match(buildMessageTurnClassName("assistant", state), /tool-call-only/);
  assert.match(buildMessageTurnClassName("assistant", state), /compact-bubble-stack-only/);
});

test("getMessageRenderState detects pending assistant placeholders", () => {
  const state = getMessageRenderState(
    {
      role: "assistant",
      pending: true,
    },
    "assistant",
  );

  assert.equal(state.pendingAssistantOnly, true);
  assert.match(buildMessageTurnClassName("assistant", state), /pending-only/);
});
