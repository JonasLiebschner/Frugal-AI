import assert from "node:assert/strict";
import test from "node:test";
import { cloneJsonForRetention, compactJsonForRetention } from "../server/ai-proxy-routing";

test("retention clones keep oversized detail strings intact", () => {
  const retained = cloneJsonForRetention({
    messages: [
      {
        role: "user",
        content: "a".repeat(80_000),
      },
    ],
    nested: {
      reasoning: "b".repeat(80_000),
    },
  });

  const messageContent = (retained as Record<string, any>).messages[0].content as string;
  const nestedReasoning = (retained as Record<string, any>).nested.reasoning as string;

  assert.equal(messageContent, "a".repeat(80_000));
  assert.equal(nestedReasoning, "b".repeat(80_000));
  assert.doesNotMatch(messageContent, /\[proxy truncated to reduce memory usage\]/);
  assert.doesNotMatch(nestedReasoning, /\[proxy truncated to reduce memory usage\]/);
});

test("retention clones keep full arrays and wide objects", () => {
  const retained = cloneJsonForRetention({
    messages: Array.from({ length: 80 }, (_, index) => ({
      role: "user",
      content: `message-${index}`,
    })),
    metadata: Object.fromEntries(
      Array.from({ length: 160 }, (_, index) => [`field_${index}`, `value-${index}`]),
    ),
  }) as Record<string, any>;

  assert.equal(Array.isArray(retained.messages), true);
  assert.equal(retained.messages.length, 80);
  assert.equal(retained.messages[0].content, "message-0");
  assert.equal(retained.messages[79].content, "message-79");

  assert.equal(retained.metadata.field_0, "value-0");
  assert.equal(retained.metadata.field_159, "value-159");
  assert.equal("__proxy_truncated_keys__" in retained.metadata, false);
});

test("retention clones are detached from later source mutations", () => {
  const source = {
    messages: [
      {
        role: "user",
        content: "hello",
      },
    ],
    nested: {
      enabled: true,
    },
  } as Record<string, any>;

  const retained = cloneJsonForRetention(source) as Record<string, any>;
  source.messages[0].content = "changed";
  source.nested.enabled = false;

  assert.equal(retained.messages[0].content, "hello");
  assert.equal(retained.nested.enabled, true);
});

test("live detail compaction still caps oversized retained strings", () => {
  const compacted = compactJsonForRetention({
    messages: [
      {
        role: "user",
        content: "a".repeat(80_000),
      },
    ],
    nested: {
      reasoning: "b".repeat(80_000),
    },
  });

  const messageContent = (compacted as Record<string, any>).messages[0].content as string;
  const nestedReasoning = (compacted as Record<string, any>).nested.reasoning as string;

  assert.match(messageContent, /\[proxy truncated to reduce memory usage\]/);
  assert.match(nestedReasoning, /\[proxy truncated to reduce memory usage\]/);
  assert.ok(messageContent.length < 17_000);
  assert.ok(nestedReasoning.length < 17_000);
});

test("live detail compaction still caps arrays and wide objects", () => {
  const compacted = compactJsonForRetention({
    messages: Array.from({ length: 80 }, (_, index) => ({
      role: "user",
      content: `message-${index}`,
    })),
    metadata: Object.fromEntries(
      Array.from({ length: 160 }, (_, index) => [`field_${index}`, `value-${index}`]),
    ),
  }) as Record<string, any>;

  assert.equal(Array.isArray(compacted.messages), true);
  assert.equal(compacted.messages.length, 24);
  assert.equal(compacted.messages[0].content, "message-0");
  assert.equal(compacted.messages[23].content, "message-23");

  assert.equal(compacted.metadata.field_0, "value-0");
  assert.equal(compacted.metadata.field_63, "value-63");
  assert.equal("field_64" in compacted.metadata, false);
  assert.equal(compacted.metadata.__proxy_truncated_keys__, 96);
});
