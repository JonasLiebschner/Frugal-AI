import assert from "node:assert/strict";
import test from "node:test";

import { buildMessageMetaBadges } from "../app/utils/message-meta-badges";

test("buildMessageMetaBadges includes assistant model and finish badges", () => {
  const badges = buildMessageMetaBadges(
    { role: "assistant", model: "gpt-test" },
    "assistant",
    { finishReason: "stop" },
  );

  assert.equal(badges.length, 2);
  assert.match(badges[0]?.text ?? "", /gpt-test/);
  assert.match(badges[1]?.text ?? "", /finish stop/);
});

test("buildMessageMetaBadges includes tool metadata badges", () => {
  const badges = buildMessageMetaBadges(
    { role: "tool", name: "search", tool_call_id: "call_1" },
    "tool",
  );

  assert.equal(badges.length, 3);
  assert.match(badges[0]?.text ?? "", /tool/);
  assert.match(badges[1]?.text ?? "", /tool search/);
  assert.match(badges[2]?.text ?? "", /call call_1/);
});

test("buildMessageMetaBadges respects hide flags and extra badges", () => {
  const badges = buildMessageMetaBadges(
    { role: "tool", name: "search", tool_call_id: "call_1" },
    "tool",
    {
      hideRoleBadge: true,
      hideToolMetaBadges: true,
      extraBadges: [{ text: "custom", tone: "neutral", title: "extra" }],
    },
  );

  assert.equal(badges.length, 1);
  assert.equal(badges[0]?.text, "custom");
});
