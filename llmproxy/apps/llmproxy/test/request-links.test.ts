import assert from "node:assert/strict";
import test from "node:test";

import {
  clearRequestDetailLinkQuery,
  readRequestDetailLinkState,
  resolveRequestDetailDeepLinkPath,
  withRequestDetailLinkQuery,
} from "../llmproxy-client";

test("request detail deep links resolve to the logs page with stable query keys", () => {
  assert.equal(resolveRequestDetailDeepLinkPath("req-123"), "/dashboard/logs?requestId=req-123");
  assert.equal(
    resolveRequestDetailDeepLinkPath("req-123", "response"),
    "/dashboard/logs?requestId=req-123&requestTab=response",
  );
});

test("request detail link state reads normalized request id and tab values", () => {
  assert.deepEqual(
    readRequestDetailLinkState({
      requestId: ["req-123"],
      requestTab: "tools",
    }),
    {
      requestId: "req-123",
      tab: "tools",
    },
  );
  assert.deepEqual(
    readRequestDetailLinkState({
      requestId: "  req-456  ",
      requestTab: "unsupported",
    }),
    {
      requestId: "req-456",
      tab: "request",
    },
  );
});

test("request detail query helpers merge and clear deep link keys without touching other filters", () => {
  const merged = withRequestDetailLinkQuery({
    outcome: "error",
  }, "req-789", "otel");
  assert.deepEqual(merged, {
    outcome: "error",
    requestId: "req-789",
    requestTab: "otel",
  });
  assert.deepEqual(clearRequestDetailLinkQuery(merged), {
    outcome: "error",
  });
});
