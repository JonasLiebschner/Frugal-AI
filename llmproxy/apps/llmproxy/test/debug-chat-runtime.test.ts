import assert from "node:assert/strict";
import test from "node:test";

import type { DashboardState } from "../app/types/dashboard";
import {
  isExpectedDebugAbort,
  resetDebugChatState,
} from "../app/utils/debug-chat-runtime";

function createDebugState(): Pick<DashboardState, "debug"> {
  return {
    debug: {
      model: "auto",
      systemPrompt: "system",
      prompt: "prompt",
      defaultPromptDismissed: false,
      queuedMessages: [{
        prompt: "queued",
        model: "auto",
        enableDiagnosticTools: true,
        params: {
          temperature: 0.1,
          top_p: 1,
          top_k: 40,
          min_p: 0,
          repeat_penalty: 1,
          max_completion_tokens: 256,
          tool_choice: "auto",
        },
      }],
      enableDiagnosticTools: true,
      stream: true,
      sending: true,
      abortController: new AbortController(),
      backend: "backend-a",
      status: "HTTP 200",
      usage: "usage",
      error: "boom",
      lastRequestId: "req-1",
      rawRequest: "{request}",
      rawResponse: "{response}",
      transcript: [{
        role: "user",
        content: "hello",
      }],
      metrics: {
        startedAt: 1,
        firstTokenAt: 2,
        lastTokenAt: 3,
        promptTokens: 4,
        completionTokens: 5,
        totalTokens: 9,
        contentTokens: 5,
        reasoningTokens: 0,
        promptMs: 10,
        generationMs: 20,
        promptPerSecond: 400,
        completionPerSecond: 250,
        finishReason: "stop",
      },
      params: {
        temperature: 0.2,
        top_p: 0.9,
        top_k: 40,
        min_p: 0.05,
        repeat_penalty: 1.1,
        max_completion_tokens: 512,
        tool_choice: "required",
      },
      dialogOpen: true,
    },
  };
}

test("resetDebugChatState clears active session fields and metrics", () => {
  const state = createDebugState();

  resetDebugChatState(state);

  assert.equal(state.debug.sending, false);
  assert.equal(state.debug.abortController, null);
  assert.deepEqual(state.debug.transcript, []);
  assert.deepEqual(state.debug.queuedMessages, []);
  assert.equal(state.debug.rawRequest, "");
  assert.equal(state.debug.rawResponse, "");
  assert.equal(state.debug.status, "");
  assert.equal(state.debug.usage, "");
  assert.equal(state.debug.error, "");
  assert.equal(state.debug.backend, "");
  assert.equal(state.debug.lastRequestId, "");
  assert.equal(state.debug.systemPrompt, "");
  assert.equal(state.debug.prompt, "");
  assert.equal(state.debug.defaultPromptDismissed, true);
  assert.equal(state.debug.metrics.startedAt, 0);
  assert.equal(state.debug.metrics.completionTokens, 0);
});

test("resetDebugChatState can seed a new draft prompt and system prompt", () => {
  const state = createDebugState();

  resetDebugChatState(state, {
    systemPrompt: "diagnostics",
    prompt: "investigate this",
    defaultPromptDismissed: false,
  });

  assert.equal(state.debug.systemPrompt, "diagnostics");
  assert.equal(state.debug.prompt, "investigate this");
  assert.equal(state.debug.defaultPromptDismissed, false);
});

test("isExpectedDebugAbort recognizes abort errors", () => {
  assert.equal(isExpectedDebugAbort(new DOMException("aborted", "AbortError")), true);
  assert.equal(isExpectedDebugAbort(Object.assign(new Error("aborted"), { name: "AbortError" })), true);
  assert.equal(isExpectedDebugAbort(new Error("other")), false);
});
