import assert from "node:assert/strict";
import test from "node:test";
import { shouldForwardUpstreamHeader } from "../server/ai-proxy-routing";

test("shouldForwardUpstreamHeader blocks browser metadata and expect headers", () => {
  assert.equal(shouldForwardUpstreamHeader("expect"), false);
  assert.equal(shouldForwardUpstreamHeader("origin"), false);
  assert.equal(shouldForwardUpstreamHeader("referer"), false);
  assert.equal(shouldForwardUpstreamHeader("priority"), false);
  assert.equal(shouldForwardUpstreamHeader("x-ai-proxy-request-id"), false);
  assert.equal(shouldForwardUpstreamHeader("sec-fetch-mode"), false);
  assert.equal(shouldForwardUpstreamHeader("sec-ch-ua"), false);
});

test("shouldForwardUpstreamHeader keeps normal API headers", () => {
  assert.equal(shouldForwardUpstreamHeader("content-type"), true);
  assert.equal(shouldForwardUpstreamHeader("authorization"), true);
  assert.equal(shouldForwardUpstreamHeader("x-api-key"), true);
});
