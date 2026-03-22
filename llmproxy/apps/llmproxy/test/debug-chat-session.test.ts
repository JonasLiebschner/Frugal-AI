import assert from "node:assert/strict";
import test from "node:test";

import type {
  DebugState,
  DebugTranscriptEntry,
} from "../app/types/dashboard";
import {
  applyDefaultDebugPrompt,
  createPendingAssistantTurn,
  findLastSentUserTurn,
  queueDebugMessage,
} from "../app/utils/debug-chat-session";
import { createInitialDebugMetrics } from "../app/utils/debug-chat-metrics";

function createDebugState(): DebugState {
  return {
    model: "auto",
    systemPrompt: "",
    prompt: "",
    defaultPromptDismissed: false,
    queuedMessages: [],
    enableDiagnosticTools: true,
    stream: true,
    sending: false,
    abortController: null,
    backend: "",
    status: "",
    usage: "",
    error: "",
    lastRequestId: "",
    rawRequest: "",
    rawResponse: "",
    transcript: [],
    metrics: createInitialDebugMetrics(),
    params: {
      temperature: 0.7,
      top_p: 0.95,
      top_k: 40,
      min_p: 0.05,
      repeat_penalty: 1.1,
      max_completion_tokens: 2048,
      tool_choice: "auto",
    },
    dialogOpen: false,
  };
}

test("applyDefaultDebugPrompt only fills untouched debug sessions", () => {
  const state = createDebugState();
  applyDefaultDebugPrompt(state, "default prompt");
  assert.equal(state.prompt, "default prompt");

  state.defaultPromptDismissed = true;
  state.prompt = "";
  applyDefaultDebugPrompt(state, "ignored");
  assert.equal(state.prompt, "");
});

test("findLastSentUserTurn returns the latest non-empty user turn clone", () => {
  const transcript: DebugTranscriptEntry[] = [
    { role: "user", content: "   " },
    { role: "assistant", content: "hello" },
    { role: "user", content: " latest prompt " },
  ];

  const result = findLastSentUserTurn(transcript);
  assert.ok(result);
  assert.equal(result.content, "latest prompt");

  (result as DebugTranscriptEntry).content = "changed";
  assert.equal(transcript[2]?.content, " latest prompt ");
});

test("queueDebugMessage snapshots the current prompt and params", () => {
  const state = createDebugState();
  state.model = "middleware:router-a";
  state.prompt = "route this";
  state.params.temperature = 0.2;

  assert.equal(queueDebugMessage(state), true);
  assert.equal(state.prompt, "");
  assert.equal(state.queuedMessages.length, 1);
  assert.equal(state.queuedMessages[0]?.model, "middleware:router-a");
  assert.equal(state.queuedMessages[0]?.prompt, "route this");
  assert.equal(state.queuedMessages[0]?.params.temperature, 0.2);

  state.params.temperature = 1.3;
  assert.equal(state.queuedMessages[0]?.params.temperature, 0.2);
});

test("createPendingAssistantTurn marks assistant turns as pending", () => {
  const turn = createPendingAssistantTurn("Waiting for model response.");

  assert.equal(turn.role, "assistant");
  assert.equal(turn.pending, true);
  assert.equal(turn.pending_title, "Waiting for model response.");
});
