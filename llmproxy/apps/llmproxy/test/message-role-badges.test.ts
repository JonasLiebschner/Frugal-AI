import assert from "node:assert/strict";
import test from "node:test";

import { buildMessageRoleBadgeSpec } from "../app/utils/message-role-badges";

test("buildMessageRoleBadgeSpec marks assistant messages as good", () => {
  const badge = buildMessageRoleBadgeSpec({}, "assistant");

  assert.equal(badge.tone, "good");
  assert.match(badge.text, /assistant/);
  assert.match(badge.title ?? "", /Assistant message/);
});

test("buildMessageRoleBadgeSpec includes tool call ids for tool messages", () => {
  const badge = buildMessageRoleBadgeSpec({ tool_call_id: "call_123" }, "tool");

  assert.equal(badge.tone, "warn");
  assert.match(badge.text, /tool/);
  assert.match(badge.title ?? "", /tool_call_id: call_123/);
});

test("buildMessageRoleBadgeSpec falls back for unknown roles", () => {
  const badge = buildMessageRoleBadgeSpec({}, "custom");

  assert.equal(badge.tone, "bad");
  assert.match(badge.text, /custom/);
  assert.match(badge.title ?? "", /Unknown OpenAI message role/);
});
