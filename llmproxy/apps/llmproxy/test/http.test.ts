import assert from "node:assert/strict";
import test from "node:test";

import { fetchJsonWithTimeout, fetchWithTimeout, readErrorResponse, readJsonResponse } from "../llmproxy-client";

test("readErrorResponse prefers nested error messages", async () => {
  const message = await readErrorResponse(new Response(JSON.stringify({
    error: {
      message: "broken",
    },
  }), {
    status: 500,
    headers: {
      "content-type": "application/json",
    },
  }));

  assert.equal(message, "broken");
});

test("fetchWithTimeout returns the fetch response when the request finishes in time", async () => {
  const response = await fetchWithTimeout("/healthz", { timeoutMs: 50 }, async () => (
    new Response("ok", { status: 200 })
  ));

  assert.equal(await response.text(), "ok");
});

test("fetchWithTimeout rejects hung requests with a timeout error", async () => {
  await assert.rejects(
    fetchWithTimeout("/slow", { timeoutMs: 10 }, async (_input, init) => {
      const signal = init?.signal;

      return await new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(signal.reason ?? new Error("aborted"));
        }, { once: true });
      });
    }),
    /Request timed out after 10 ms\./,
  );
});

test("fetchWithTimeout respects an already aborted external signal", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled by caller"));

  await assert.rejects(
    fetchWithTimeout("/cancelled", { timeoutMs: 50, signal: controller.signal }, async (_input, init) => {
      const signal = init?.signal;
      throw signal?.reason ?? new Error("missing abort reason");
    }),
    /cancelled by caller/,
  );
});

test("readJsonResponse parses JSON responses", async () => {
  const payload = await readJsonResponse<{ ok: boolean }>(new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  }));

  assert.deepEqual(payload, { ok: true });
});

test("readJsonResponse throws the parsed API error message for non-ok responses", async () => {
  await assert.rejects(
    readJsonResponse(new Response(JSON.stringify({
      error: {
        message: "nope",
      },
    }), {
      status: 400,
      headers: {
        "content-type": "application/json",
      },
    })),
    /nope/,
  );
});

test("fetchJsonWithTimeout combines timeout handling and JSON parsing", async () => {
  const payload = await fetchJsonWithTimeout<{ value: number }>("/json", { timeoutMs: 50 }, async () => (
    new Response(JSON.stringify({ value: 42 }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    })
  ));

  assert.deepEqual(payload, { value: 42 });
});
