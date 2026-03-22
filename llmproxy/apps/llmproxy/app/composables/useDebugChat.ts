import type {
  DashboardState,
  DebugQueuedMessage,
  DebugTranscriptEntry,
} from "../types/dashboard";
import { waitForBrowserPaint } from "../utils/browserPaint";
import { buildDiagnosticsChatTools } from "../../llmproxy-client";
import { defaultDebugChatPrompt } from "../utils/debug-chat-suggestions";
import {
  applyDefaultDebugPrompt,
  cloneDebugTranscriptEntry,
  createPendingAssistantTurn,
  findLastSentUserTurn,
  queueDebugMessage,
  shiftQueuedDebugMessage as shiftQueuedDebugMessageFromState,
} from "../utils/debug-chat-session";
import { truncateDebugRawText } from "../utils/debug-chat-stream";
import {
  buildDebugHistoryMessage,
  extractDebugToolCalls,
  hasReplayableDebugMessage,
  hasVisibleAssistantTurnPayload,
  replaceTranscriptEntry as replaceDebugTranscriptEntry,
} from "../utils/debug-chat-transcript";
import { executeDebugToolCalls } from "../utils/debug-chat-tools";
import { createClientDebugRequestId } from "../utils/debug-chat-metrics";
import { runSingleDebugAssistantRequest } from "../utils/debug-chat-request";
import {
  isExpectedDebugAbort,
  resetDebugChatState,
  resetDebugMetricsState,
  startDebugMetricsTicker as startDebugMetricsTickerState,
  stopDebugMetricsTicker as stopDebugMetricsTickerState,
} from "../utils/debug-chat-runtime";
import { prettyJson } from "../utils/formatters";

export function useDebugChat(
  state: DashboardState,
  onErrorToast: (title: string, message: string) => void,
) {
  const maxFunctionRounds = 100;
  let metricsTicker: number | undefined;
  let activeRunId = 0;

  function ensureDefaultDebugPrompt(): void {
    applyDefaultDebugPrompt(state.debug, defaultDebugChatPrompt);
  }

  function replaceTranscriptEntry(entry: DebugTranscriptEntry): DebugTranscriptEntry {
    return replaceDebugTranscriptEntry(state.debug.transcript, entry);
  }

  function queueCurrentDebugMessage(): boolean {
    return queueDebugMessage(state.debug);
  }

  function shiftQueuedDebugMessage(): DebugQueuedMessage | null {
    return shiftQueuedDebugMessageFromState(state.debug);
  }

  function resetDebugMetrics(): void {
    resetDebugMetricsState(state);
  }

  function stopDebugMetricsTicker(): void {
    metricsTicker = stopDebugMetricsTickerState(metricsTicker);
  }

  function startDebugMetricsTicker(): void {
    metricsTicker = startDebugMetricsTickerState(state, metricsTicker);
  }

  async function sendDebugChat(queuedMessage: DebugQueuedMessage | null = null): Promise<void> {
    if (state.debug.sending) {
      queueCurrentDebugMessage();
      return;
    }

    const runId = activeRunId + 1;
    activeRunId = runId;

    state.debug.stream = true;

    const prompt = (queuedMessage?.prompt ?? state.debug.prompt).trim();
    const model = queuedMessage?.model ?? state.debug.model;
    const enableDiagnosticTools = queuedMessage?.enableDiagnosticTools ?? state.debug.enableDiagnosticTools;
    const params = queuedMessage?.params ?? state.debug.params;
    const resendLastUserTurn = queuedMessage === null && prompt.length === 0
      ? findLastSentUserTurn(state.debug.transcript)
      : null;
    const effectivePrompt = resendLastUserTurn?.content ?? prompt;

    if (!model) {
      state.debug.error = "Please select a model first.";
      return;
    }

    if (!effectivePrompt) {
      state.debug.error = "Please enter a user message.";
      return;
    }

    const history = resendLastUserTurn
      ? [{
          role: "user",
          content: effectivePrompt,
        }]
      : [
          ...state.debug.transcript
            .map((entry) => buildDebugHistoryMessage(entry))
            .filter((entry): entry is Record<string, any> => hasReplayableDebugMessage(entry)),
          {
            role: "user",
            content: effectivePrompt,
          },
        ];

    const diagnosticsAllowed = state.mcpEnabled !== false;
    let diagnosticTools: Array<Record<string, unknown>> | undefined;
    if (enableDiagnosticTools && diagnosticsAllowed) {
      try {
        diagnosticTools = await buildDiagnosticsChatTools();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state.debug.error = message;
        onErrorToast("llmproxy functions", message);
        return;
      }
    }

    const userTurn: DebugTranscriptEntry = resendLastUserTurn ?? {
      role: "user",
      content: effectivePrompt,
    };
    const initialWaitingTitle = "Waiting for model response.";
    let assistantTurn = createPendingAssistantTurn(initialWaitingTitle);
    const requestId = createClientDebugRequestId();
    const previousTranscript = queuedMessage === null && resendLastUserTurn
      ? state.debug.transcript.map((entry) => cloneDebugTranscriptEntry(entry))
      : null;

    state.debug.sending = true;
    if (queuedMessage === null && resendLastUserTurn) {
      state.debug.transcript.splice(0, state.debug.transcript.length, userTurn);
    } else {
      state.debug.transcript.push(userTurn);
    }

    state.debug.transcript.push(assistantTurn);
    assistantTurn = state.debug.transcript[state.debug.transcript.length - 1] as DebugTranscriptEntry;
    state.debug.error = "";
    state.debug.backend = "";
    state.debug.status = "";
    state.debug.usage = "";
    resetDebugMetrics();
    state.debug.metrics.startedAt = Date.now();
    state.debug.lastRequestId = requestId;
    state.debug.rawRequest = "";
    state.debug.rawResponse = "";
    if (!queuedMessage) {
      state.debug.prompt = "";
    }
    state.debug.abortController = new AbortController();
    startDebugMetricsTicker();

    try {
      await waitForBrowserPaint();

      let currentAssistantTurn = assistantTurn;
      let currentRequestId = requestId;

      for (let round = 0; round < maxFunctionRounds; round += 1) {
        const currentPayload = {
          model,
          messages: [
            ...(state.debug.systemPrompt.trim()
              ? [{
                  role: "system",
                  content: state.debug.systemPrompt.trim(),
                }]
              : []),
            ...history,
          ],
          stream: true,
          temperature: params.temperature,
          top_p: params.top_p,
          top_k: Math.round(params.top_k),
          min_p: params.min_p,
          repeat_penalty: params.repeat_penalty,
          max_completion_tokens: Math.max(1, Math.round(params.max_completion_tokens)),
          ...(diagnosticTools ? { tools: diagnosticTools } : {}),
          ...(diagnosticTools ? { tool_choice: params.tool_choice } : {}),
        };

        state.debug.lastRequestId = currentRequestId;
        state.debug.rawRequest = truncateDebugRawText(prettyJson(currentPayload));
        currentAssistantTurn = await runSingleDebugAssistantRequest(
          state,
          currentPayload,
          currentAssistantTurn,
          currentRequestId,
          replaceTranscriptEntry,
        );
        assistantTurn = currentAssistantTurn;

        const assistantHistoryMessage = buildDebugHistoryMessage(currentAssistantTurn);
        if (assistantHistoryMessage) {
          history.push(assistantHistoryMessage);
        }

        if (!enableDiagnosticTools || !diagnosticsAllowed) {
          break;
        }

        const toolCalls = extractDebugToolCalls(currentAssistantTurn);
        if (toolCalls.length === 0) {
          break;
        }

        state.debug.status = `Running ${toolCalls.length} llmproxy function call${toolCalls.length === 1 ? "" : "s"}...`;
        const toolTurns = await executeDebugToolCalls(toolCalls, {
          onStart(toolCall) {
            const pendingToolTurn: DebugTranscriptEntry = {
              role: "tool",
              name: toolCall.name,
              tool_call_id: toolCall.id,
              pending: true,
              pending_title: `Waiting for ${toolCall.name} to return...`,
            };
            state.debug.transcript.push(pendingToolTurn);
            return state.debug.transcript[state.debug.transcript.length - 1] as DebugTranscriptEntry;
          },
          onFinish(toolTurn, _toolCall, pendingTurn) {
            if (pendingTurn) {
              Object.assign(pendingTurn, toolTurn, {
                pending: false,
                pending_title: "",
              });
              replaceTranscriptEntry(pendingTurn);
              return;
            }

            state.debug.transcript.push(toolTurn);
          },
        });

        for (const toolTurn of toolTurns) {
          const toolHistoryMessage = buildDebugHistoryMessage(toolTurn);
          if (toolHistoryMessage) {
            history.push(toolHistoryMessage);
          }
        }

        if (round === maxFunctionRounds - 1) {
          onErrorToast("llmproxy functions", "Maximum llmproxy function rounds reached.");
          break;
        }

        currentAssistantTurn = createPendingAssistantTurn("Waiting for the next model response.");
        state.debug.transcript.push(currentAssistantTurn);
        currentAssistantTurn = state.debug.transcript[state.debug.transcript.length - 1] as DebugTranscriptEntry;
        assistantTurn = currentAssistantTurn;
        currentRequestId = createClientDebugRequestId();
      }
    } catch (error) {
      if (runId !== activeRunId || isExpectedDebugAbort(error)) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      state.debug.error = message;
      onErrorToast("Chat request", message);

      if (!hasVisibleAssistantTurnPayload(assistantTurn)) {
        state.debug.transcript.pop();

        if (previousTranscript) {
          state.debug.transcript.splice(0, state.debug.transcript.length, ...previousTranscript);
        }
      }
    } finally {
      if (runId === activeRunId) {
        state.debug.sending = false;
        state.debug.abortController = null;
        stopDebugMetricsTicker();

        const nextQueuedMessage = shiftQueuedDebugMessage();
        if (nextQueuedMessage) {
          void sendDebugChat(nextQueuedMessage);
        }
      }
    }
  }

  function stopDebugChat(): void {
    activeRunId += 1;
    state.debug.abortController?.abort(new Error("Request cancelled from dashboard."));
    state.debug.sending = false;
    state.debug.abortController = null;
    state.debug.queuedMessages.splice(0);
    stopDebugMetricsTicker();
  }

  function clearDebugChat(): void {
    activeRunId += 1;
    state.debug.abortController?.abort(new Error("Chat session cleared."));
    stopDebugMetricsTicker();
    resetDebugChatState(state);
  }

  function prepareDebugChatDraft(systemPrompt: string, prompt: string): void {
    activeRunId += 1;
    stopDebugMetricsTicker();
    state.debug.abortController?.abort(new Error("Chat session reset from diagnostics."));
    resetDebugChatState(state, {
      systemPrompt: systemPrompt.trim(),
      prompt,
      defaultPromptDismissed: false,
    });
  }

  return {
    clearDebugChat,
    ensureDefaultDebugPrompt,
    prepareDebugChatDraft,
    sendDebugChat,
    stopDebugChat,
    stopDebugMetricsTicker,
  };
}
