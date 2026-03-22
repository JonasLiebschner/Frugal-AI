import assert from "node:assert/strict";
import test from "node:test";
import { toErrorMessage } from "../../shared/server/core-utils";
import { extractClientIp, type ClientIpSource } from "../../shared/server/network-utils";

test("toErrorMessage includes a nested cause when it adds context", () => {
  const error = new Error("fetch failed", {
    cause: new Error("expect header not supported"),
  });

  assert.equal(
    toErrorMessage(error),
    "fetch failed (expect header not supported)",
  );
});

test("toErrorMessage keeps the base message when the cause is the same", () => {
  const error = new Error("fetch failed", {
    cause: new Error("fetch failed"),
  });

  assert.equal(toErrorMessage(error), "fetch failed");
});

test("extractClientIp prefers common forwarding headers", () => {
  const request = {
    headers: {
      "x-forwarded-for": "198.51.100.10, 10.0.0.8",
      "cf-connecting-ip": "203.0.113.5",
    },
    socket: {
      remoteAddress: "127.0.0.1",
    },
  } satisfies ClientIpSource;

  assert.equal(extractClientIp(request), "198.51.100.10");
});

test("extractClientIp falls back to Forwarded and remoteAddress", () => {
  const forwardedRequest = {
    headers: {
      forwarded: 'for="[2001:db8:cafe::17]";proto=https',
    },
    socket: {
      remoteAddress: "127.0.0.1",
    },
  } satisfies ClientIpSource;
  const directRequest = {
    headers: {},
    socket: {
      remoteAddress: "::ffff:127.0.0.1",
    },
  } satisfies ClientIpSource;

  assert.equal(extractClientIp(forwardedRequest), "2001:db8:cafe::17");
  assert.equal(extractClientIp(directRequest), "::ffff:127.0.0.1");
});
