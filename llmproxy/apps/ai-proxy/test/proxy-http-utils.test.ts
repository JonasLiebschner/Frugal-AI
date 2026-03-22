import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProxyMethodNotAllowedMessage,
  buildProxyNotImplementedMessage,
  extractErrorMessageFromPayload,
  isErrorStatus,
  sanitizeUpstreamErrorPayloadForClient,
} from "../server/ai-proxy-routing";

test("isErrorStatus treats every non-2xx status as an error", () => {
  assert.equal(isErrorStatus(undefined), false);
  assert.equal(isErrorStatus(199), true);
  assert.equal(isErrorStatus(200), false);
  assert.equal(isErrorStatus(204), false);
  assert.equal(isErrorStatus(299), false);
  assert.equal(isErrorStatus(300), true);
  assert.equal(isErrorStatus(302), true);
  assert.equal(isErrorStatus(400), true);
  assert.equal(isErrorStatus(500), true);
});

test('extractErrorMessageFromPayload strips "Sorry about that!" from upstream errors', () => {
  assert.equal(
    extractErrorMessageFromPayload({
      error: {
        message: "The server had an error while processing your request. Sorry about that! Please retry.",
      },
    }),
    "The server had an error while processing your request. Please retry.",
  );
});

test("sanitizeUpstreamErrorPayloadForClient removes the apology sentence without mutating input", () => {
  const payload = {
    error: {
      message: "The server had an error while processing your request. Sorry about that! Please retry.",
      type: "server_error",
    },
  } as const;

  const sanitized = sanitizeUpstreamErrorPayloadForClient(payload);

  assert.deepEqual(sanitized, {
    error: {
      message: "The server had an error while processing your request. Please retry.",
      type: "server_error",
    },
  });
  assert.equal(
    payload.error.message,
    "The server had an error while processing your request. Sorry about that! Please retry.",
  );
});

test("proxy route messages stay aligned across shared route helpers", () => {
  assert.equal(
    buildProxyMethodNotAllowedMessage("GET", "/v1/chat/completions"),
    'Route "GET /v1/chat/completions" is not available for this HTTP method.',
  );
  assert.equal(
    buildProxyNotImplementedMessage("PATCH", "/v1/embeddings"),
    'Route "PATCH /v1/embeddings" is not implemented. Supported routes: GET /v1/models, POST /v1/chat/completions.',
  );
});
