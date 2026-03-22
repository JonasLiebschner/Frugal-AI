import {
  JsonValue,
  ProxySnapshot,
  RequestLogDetail,
  RequestLogEntry,
} from "../../shared/type-api";
import type {
  DiagnosticFact,
  DiagnosticFinding,
  DiagnosticIssueSummary,
  DiagnosticPromptContextPayload,
  DiagnosticPromptDefinition,
  DiagnosticPromptMessage,
  DiagnosticPromptName,
  DiagnosticReport,
} from "./ai-client-types";
import {
  extractErrorMessageFromPayload,
  resolveEffectiveCompletionTokenLimit,
  resolveModelCompletionLimit,
  resolveRequestedCompletionLimit,
} from "./ai-client-diagnostic-http";

interface RepetitionSignal {
  summary: string;
  evidence: string[];
  troubleshooting: string[];
}

interface ToolCallIssueSignal {
  summary: string;
  evidence: string[];
  troubleshooting: string[];
}

interface ToolResultErrorSignal {
  summary: string;
  evidence: string[];
  troubleshooting: string[];
}

interface InterruptedResponseSignal {
  summary: string;
  evidence: string[];
  troubleshooting: string[];
}

const DIAGNOSTIC_PROMPTS: DiagnosticPromptDefinition[] = [
  {
    name: "diagnose-request",
    title: "General diagnosis",
    description: "Review a stored proxy request, explain what happened, and propose concrete next changes.",
    arguments: [
      {
        name: "request_id",
        description: "ID of the stored proxy request to diagnose.",
        required: true,
      },
    ],
  },
  {
    name: "troubleshoot-max-tokens",
    title: "Max tokens / truncation",
    description: "Focus on finish_reason=length, token limits, and how to avoid truncation.",
    arguments: [
      {
        name: "request_id",
        description: "ID of the stored proxy request to analyze for truncation.",
        required: true,
      },
    ],
  },
  {
    name: "troubleshoot-repetition",
    title: "Repetition / looping",
    description: "Focus on endless repetition, looping outputs, and how to tune the request to stop it.",
    arguments: [
      {
        name: "request_id",
        description: "ID of the stored proxy request to analyze for repetition.",
        required: true,
      },
    ],
  },
  {
    name: "troubleshoot-routing",
    title: "Routing / backend selection",
    description: "Focus on rejected requests, queue timeouts, backend selection, and actual routed model choice.",
    arguments: [
      {
        name: "request_id",
        description: "ID of the stored proxy request to analyze for routing or backend issues.",
        required: true,
      },
    ],
  },
];

export function listDiagnosticPrompts(): DiagnosticPromptDefinition[] {
  return DIAGNOSTIC_PROMPTS.map((prompt) => ({
    ...prompt,
    arguments: prompt.arguments.map((argument) => ({ ...argument })),
  }));
}

export function buildDiagnosticReport(
  detail: RequestLogDetail,
  snapshot: ProxySnapshot,
): DiagnosticReport {
  const outputText = extractPrimaryAssistantText(detail.responseBody);
  const rawResponsePreview = buildResponseBodyPreview(detail.responseBody);
  const upstreamErrorMessage = detail.entry.error?.trim() || extractErrorMessageFromPayload(detail.responseBody);
  const outputPreviewSource = outputText || rawResponsePreview;
  const outputPreview = outputPreviewSource.length > 600
    ? `${outputPreviewSource.slice(0, 597).trimEnd()}...`
    : outputPreviewSource;
  const requestTokenLimit = resolveRequestedCompletionLimit(detail.requestBody);
  const modelTokenLimit = resolveModelCompletionLimit(
    detail.entry.model,
    detail.entry.backendId,
    snapshot.backends,
  );
  const effectiveTokenLimit = resolveEffectiveCompletionTokenLimit(requestTokenLimit, modelTokenLimit)
    ?? detail.entry.effectiveCompletionTokenLimit;
  const completionTokens = detail.entry.completionTokens;
  const findings: DiagnosticFinding[] = [];

  const maxTokensReached = detectMaxTokensReached(detail.entry.finishReason, completionTokens, effectiveTokenLimit);
  if (maxTokensReached) {
    findings.push({
      code: "max_tokens_reached",
      severity: "warn",
      title: "Completion likely hit its token ceiling",
      summary: detail.entry.finishReason === "length"
        ? "The response ended with finish_reason=length, so generation stopped because the completion budget was exhausted."
        : "The generated completion is effectively at the configured token limit, so the answer was likely cut off by the token budget.",
      evidence: buildMaxTokenEvidence(detail.entry.finishReason, completionTokens, requestTokenLimit, modelTokenLimit, effectiveTokenLimit),
      troubleshooting: [
        "Increase max_completion_tokens or max_tokens for this request if you need a longer answer.",
        "Ask for a shorter or more focused answer, or split the task into smaller turns.",
        "If the model itself has a lower output cap than the request asks for, route to a backend model with a larger completion limit.",
      ],
    });
  }

  const repetitionSignal = detectRepetition(outputText);
  if (repetitionSignal) {
    findings.push({
      code: "endless_repetition",
      severity: maxTokensReached ? "bad" : "warn",
      title: "Degenerate repetition detected",
      summary: repetitionSignal.summary,
      evidence: repetitionSignal.evidence,
      troubleshooting: repetitionSignal.troubleshooting,
    });
  }

  const toolCallIssue = detectMalformedToolCall(detail.responseBody, detail.entry.finishReason);
  if (toolCallIssue) {
    findings.push({
      code: "malformed_tool_call",
      severity: "bad",
      title: "Tool call payload is malformed",
      summary: toolCallIssue.summary,
      evidence: toolCallIssue.evidence,
      troubleshooting: toolCallIssue.troubleshooting,
    });
  }

  const toolResultError = detectToolResultError(detail.requestBody);
  if (toolResultError) {
    findings.push({
      code: "tool_result_error",
      severity: detail.entry.outcome === "error" ? "bad" : "warn",
      title: "Previous tool result already contained an error",
      summary: toolResultError.summary,
      evidence: toolResultError.evidence,
      troubleshooting: toolResultError.troubleshooting,
    });
  }

  if (!detail.entry.backendId && (detail.entry.outcome === "error" || detail.entry.outcome === "queued_timeout")) {
    findings.push({
      code: "request_rejected",
      severity: "bad",
      title: "Request never reached a backend",
      summary: "The proxy rejected or timed out this request before it could be assigned to any backend.",
      evidence: [
        `Final status: ${detail.entry.outcome}.`,
        detail.entry.error ? `Error: ${detail.entry.error}` : "No backend assignment was stored for this request.",
      ],
      troubleshooting: [
        "Check whether a healthy enabled backend exists for the requested model.",
        'If the client sent model "auto" or "*", ensure at least one backend currently exposes a concrete model.',
        "Increase backend max concurrency or queue timeout if the request is timing out while waiting for capacity.",
      ],
    });
  }

  if (detail.entry.backendId && detail.entry.outcome === "error") {
    findings.push({
      code: "upstream_error",
      severity: "bad",
      title: "Backend request failed after routing",
      summary: buildUpstreamErrorSummary(detail.entry.statusCode, upstreamErrorMessage),
      evidence: buildUpstreamErrorEvidence(detail.entry, upstreamErrorMessage, rawResponsePreview),
      troubleshooting: [
        "Inspect the backend health state and upstream logs for the selected backend.",
        "Verify connector compatibility, request schema, and model availability on that backend.",
        "If this only fails for one model, compare the request against a known-good model/backend combination.",
      ],
    });
  }

  const interruptedResponse = detectInterruptedResponse(detail.entry, outputText, detail.responseBody);
  if (interruptedResponse) {
    findings.push({
      code: "interrupted_response",
      severity: "warn",
      title: "Generation was interrupted mid-response",
      summary: interruptedResponse.summary,
      evidence: interruptedResponse.evidence,
      troubleshooting: interruptedResponse.troubleshooting,
    });
  }

  if (detail.entry.outcome === "cancelled") {
    findings.push({
      code: "cancelled",
      severity: "info",
      title: "Request was cancelled",
      summary: "Generation stopped because the client or dashboard cancelled the request before completion.",
      evidence: [
        detail.entry.error ? `Cancellation detail: ${detail.entry.error}` : "The stored request ended with outcome=cancelled.",
      ],
      troubleshooting: [
        "Only troubleshoot this if the cancellation was unexpected.",
        "If cancellations happen under load, check client timeouts, user abort logic, and dashboard-triggered cancels.",
      ],
    });
  }

  if (findings.length === 0) {
    findings.push({
      code: "no_obvious_issue",
      severity: "info",
      title: "No obvious failure signal detected",
      summary: "This request does not show a clear truncation, routing, repetition, or upstream failure signal in the stored data.",
      evidence: [
        detail.entry.finishReason
          ? `finish_reason=${detail.entry.finishReason}.`
          : "No explicit finish reason was stored.",
        detail.entry.outcome === "success"
          ? "The stored request completed successfully."
          : `Stored outcome: ${detail.entry.outcome}.`,
      ],
      troubleshooting: [
        "Use the general diagnosis prompt to inspect prompt quality, tool behavior, and response quality in more detail.",
      ],
    });
  }

  const recommendedPrompts = buildRecommendedPrompts(findings);
  const summary = buildDiagnosticSummary(findings, detail.entry);

  return {
    requestId: detail.entry.id,
    generatedAt: new Date().toISOString(),
    live: detail.live === true,
    status: detail.entry.outcome,
    summary,
    resolvedModel: detail.entry.model,
    backendName: detail.entry.backendName,
    finishReason: detail.entry.finishReason,
    requestTokenLimit,
    modelTokenLimit,
    effectiveTokenLimit,
    completionTokens,
    outputPreview,
    findings,
    recommendedPrompts,
    facts: buildFacts(detail.entry, requestTokenLimit, modelTokenLimit, effectiveTokenLimit, outputText),
    signals: {
      maxTokensReached,
      repetitionDetected: Boolean(repetitionSignal),
      malformedToolCall: Boolean(toolCallIssue),
      toolResultError: Boolean(toolResultError),
      interruptedResponse: Boolean(interruptedResponse),
      requestRejected: findings.some((finding) => finding.code === "request_rejected"),
      upstreamError: findings.some((finding) => finding.code === "upstream_error"),
    },
  };
}

export function selectPrimaryDiagnosticIssue(report: Pick<DiagnosticReport, "findings">): DiagnosticIssueSummary | undefined {
  const finding = report.findings.find((candidate) => candidate.severity === "bad")
    ?? report.findings.find((candidate) => candidate.severity === "warn");

  if (!finding || (finding.severity !== "bad" && finding.severity !== "warn")) {
    return undefined;
  }

  return {
    severity: finding.severity,
    title: finding.title,
    summary: finding.summary,
  };
}

export function buildDiagnosticPrompt(
  name: DiagnosticPromptName,
  detail: RequestLogDetail,
  snapshot: ProxySnapshot,
): { name: DiagnosticPromptName; title: string; description: string; messages: DiagnosticPromptMessage[] } {
  const definition = DIAGNOSTIC_PROMPTS.find((entry) => entry.name === name);
  if (!definition) {
    throw new Error(`Unknown diagnostics prompt "${name}".`);
  }

  const report = buildDiagnosticReport(detail, snapshot);
  const serializedContext = JSON.stringify(
    buildDiagnosticPromptContextPayload(detail, snapshot),
    null,
    2,
  );

  const systemText = buildSystemPrompt(name);
  const userText = [
    "Diagnose this proxy request using the provided structured context.",
    "Return:",
    "1. A concise diagnosis",
    "2. The strongest evidence",
    "3. Concrete troubleshooting changes to try next",
    "",
    "Structured context:",
    "```json",
    serializedContext,
    "```",
  ].join("\n");

  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    messages: [
      {
        role: "system",
        text: systemText,
      },
      {
        role: "user",
        text: userText,
      },
    ],
  };
}

export function buildDiagnosticPromptFromContext(
  name: DiagnosticPromptName,
  payload: DiagnosticPromptContextPayload,
): { name: DiagnosticPromptName; title: string; description: string; messages: DiagnosticPromptMessage[] } {
  const definition = DIAGNOSTIC_PROMPTS.find((entry) => entry.name === name);
  if (!definition) {
    throw new Error(`Unknown diagnostics prompt "${name}".`);
  }

  const serializedContext = JSON.stringify(payload, null, 2);

  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    messages: [
      {
        role: "system",
        text: buildSystemPrompt(name),
      },
      {
        role: "user",
        text: [
          "Diagnose this proxy request using the provided structured context.",
          "Return:",
          "1. A concise diagnosis",
          "2. The strongest evidence",
          "3. Concrete troubleshooting changes to try next",
          "",
          "Structured context:",
          "```json",
          serializedContext,
          "```",
        ].join("\n"),
      },
    ],
  };
}

export function buildDiagnosticPromptContextPayload(
  detail: RequestLogDetail,
  snapshot: ProxySnapshot,
): DiagnosticPromptContextPayload {
  return {
    report: buildDiagnosticReport(detail, snapshot),
    request: {
      entry: detail.entry,
      requestBody: detail.requestBody ?? null,
      responseBodyPreview: buildResponseBodyPreview(detail.responseBody),
    },
  };
}

function buildSystemPrompt(name: DiagnosticPromptName): string {
  if (name === "troubleshoot-max-tokens") {
    return "You diagnose proxy requests with a focus on truncation, finish_reason=length, token ceilings, and how to adjust prompts or token limits without causing new failures.";
  }

  if (name === "troubleshoot-repetition") {
    return "You diagnose proxy requests with a focus on endless repetition, looping generations, and concrete decoding or prompt changes that reduce degeneration.";
  }

  if (name === "troubleshoot-routing") {
    return "You diagnose proxy routing issues with a focus on backend selection, missing model matches, queue saturation, and backend compatibility problems.";
  }

  return "You are a proxy diagnostics assistant. Explain what happened, identify the likeliest failure mode, and recommend precise next changes to the request, model choice, or backend configuration.";
}

function buildFacts(
  entry: RequestLogEntry,
  requestTokenLimit: number | undefined,
  modelTokenLimit: number | undefined,
  effectiveTokenLimit: number | undefined,
  outputText: string,
): DiagnosticFact[] {
  const facts: DiagnosticFact[] = [];

  if (requestTokenLimit !== undefined) {
    facts.push({
      label: "Request token limit",
      value: String(requestTokenLimit),
    });
  }

  if (modelTokenLimit !== undefined) {
    facts.push({
      label: "Model token limit",
      value: String(modelTokenLimit),
    });
  }

  facts.push({
    label: "Output chars",
    value: String(outputText.length),
  });

  return facts;
}

function buildRecommendedPrompts(findings: DiagnosticFinding[]): DiagnosticPromptName[] {
  const prompts = new Set<DiagnosticPromptName>(["diagnose-request"]);

  if (findings.some((finding) => finding.code === "max_tokens_reached")) {
    prompts.add("troubleshoot-max-tokens");
  }

  if (findings.some((finding) => finding.code === "endless_repetition")) {
    prompts.add("troubleshoot-repetition");
  }

  if (findings.some((finding) => (
    finding.code === "request_rejected"
    || finding.code === "upstream_error"
    || finding.code === "malformed_tool_call"
    || finding.code === "tool_result_error"
  ))) {
    prompts.add("troubleshoot-routing");
  }

  return Array.from(prompts);
}

function buildDiagnosticSummary(findings: DiagnosticFinding[], entry: RequestLogEntry): string {
  const badFinding = findings.find((finding) => finding.severity === "bad");
  if (badFinding) {
    return badFinding.summary;
  }

  const warnFinding = findings.find((finding) => finding.severity === "warn");
  if (warnFinding) {
    return warnFinding.summary;
  }

  if (entry.outcome === "success") {
    return "";
  }

  return "The retained request data does not point to one dominant failure mode yet.";
}

function buildUpstreamErrorSummary(
  statusCode: number | undefined,
  errorMessage: string | undefined,
): string {
  if (typeof statusCode === "number" && errorMessage) {
    return `The request reached a backend, but the upstream returned HTTP ${statusCode}: ${errorMessage}`;
  }

  if (typeof statusCode === "number") {
    return `The request reached a backend, but the upstream returned HTTP ${statusCode}.`;
  }

  if (errorMessage) {
    return `The request reached a backend, but the upstream call still failed: ${errorMessage}`;
  }

  return "The request was assigned to a backend, but the upstream call still failed before a successful completion.";
}

function buildUpstreamErrorEvidence(
  entry: RequestLogEntry,
  errorMessage: string | undefined,
  rawResponsePreview: string,
): string[] {
  const evidence = [
    entry.backendName ? `Backend: ${entry.backendName}.` : "A backend had already been assigned.",
    entry.statusCode ? `HTTP status: ${entry.statusCode}.` : "No final upstream status code was stored.",
  ];

  if (errorMessage) {
    evidence.push(`Error: ${truncate(errorMessage, 220)}.`);
  } else {
    evidence.push("The upstream backend returned an unspecified error.");
  }

  const normalizedPreview = normalizeWhitespace(rawResponsePreview);
  if (normalizedPreview) {
    evidence.push(`Retained raw response: ${truncate(normalizedPreview, 220)}.`);
  }

  return evidence;
}

function buildMaxTokenEvidence(
  finishReason: string | undefined,
  completionTokens: number | undefined,
  requestLimit: number | undefined,
  modelLimit: number | undefined,
  effectiveLimit: number | undefined,
): string[] {
  const evidence: string[] = [];

  if (finishReason) {
    evidence.push(`finish_reason=${finishReason}.`);
  }

  if (completionTokens !== undefined) {
    evidence.push(
      effectiveLimit !== undefined
        ? `Generated ${completionTokens} / ${effectiveLimit} completion tokens.`
        : `Generated ${completionTokens} completion tokens.`,
    );
  }

  if (requestLimit !== undefined) {
    evidence.push(`Requested completion limit: ${requestLimit}.`);
  }

  if (modelLimit !== undefined) {
    evidence.push(`Model completion limit: ${modelLimit}.`);
  }

  return evidence;
}

function detectMaxTokensReached(
  finishReason: string | undefined,
  completionTokens: number | undefined,
  effectiveLimit: number | undefined,
): boolean {
  if (finishReason === "length") {
    return true;
  }

  if (completionTokens === undefined || effectiveLimit === undefined || effectiveLimit <= 0) {
    return false;
  }

  return completionTokens >= Math.max(1, Math.floor(effectiveLimit * 0.98));
}

function detectRepetition(text: string): RepetitionSignal | undefined {
  if (!text.trim()) {
    return undefined;
  }

  const normalized = normalizeWhitespace(text);
  const repeatedLine = detectRepeatedLine(text);
  if (repeatedLine) {
    return repeatedLine;
  }

  const repeatedTailPhrase = detectRepeatedTailPhrase(normalized);
  if (repeatedTailPhrase) {
    return repeatedTailPhrase;
  }

  return undefined;
}

function detectMalformedToolCall(
  responseBody: JsonValue | undefined,
  finishReason: string | undefined,
): ToolCallIssueSignal | undefined {
  const toolCalls = collectAssistantToolCalls(responseBody);

  if (finishReason === "tool_calls" && toolCalls.length === 0) {
    return {
      summary: "The response ended with finish_reason=tool_calls, but no usable tool_calls payload was retained, so the next tool-execution step cannot be trusted.",
      evidence: [
        "finish_reason=tool_calls.",
        "No assistant tool_calls were retained in the stored response body.",
      ],
      troubleshooting: [
        "Inspect the raw streamed chunks or upstream logs to confirm whether the backend emitted incomplete tool-call deltas.",
        "Make sure the backend connector is preserving tool_calls correctly for this model and endpoint.",
        "Retry with a simpler tool schema and shorter prompt to rule out truncation or malformed partial tool-call output.",
      ],
    };
  }

  for (const toolCall of toolCalls) {
    const name = readToolCallName(toolCall);
    const rawArguments = readToolCallArguments(toolCall);
    const label = name ? `Tool "${name}"` : "A tool call";

    if (!name) {
      return {
        summary: "The assistant emitted a tool call without a function name, so the proxy or client cannot execute it safely.",
        evidence: [
          `${label} is missing a function name.`,
        ],
        troubleshooting: [
          "Inspect the raw response chunks to confirm whether the model emitted a partial tool-call delta.",
          "Retry with a simpler tool list and shorter prompt so the model has less room to produce malformed tool-call metadata.",
          "If this happens only on one backend, compare connector compatibility and model tool-calling support.",
        ],
      };
    }

    if (!rawArguments) {
      return {
        summary: `The assistant called ${name}, but the tool arguments were empty or missing, so the MCP/tool execution step would fail immediately.`,
        evidence: [
          `Tool "${name}" has no usable arguments payload.`,
        ],
        troubleshooting: [
          "Inspect the retained response body to confirm whether the backend emitted incomplete tool-call deltas.",
          "Retry with a simpler schema and ensure the model is instructed to produce valid JSON arguments.",
          "If the backend is streaming tool_calls, compare the assembled response against the raw SSE chunks.",
        ],
      };
    }

    try {
      const parsed = JSON.parse(rawArguments) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return {
          summary: `The assistant called ${name}, but the arguments do not resolve to a JSON object, so MCP/function execution would not have a valid parameter object.`,
          evidence: [
            `Tool "${name}" arguments: ${truncate(rawArguments, 220)}.`,
          ],
          troubleshooting: [
            "Keep tool schemas object-shaped and prompt the model to emit a JSON object only.",
            "Reduce output length pressure so streamed tool-call arguments are less likely to be truncated or malformed.",
            "Compare this response against a known-good model/backend that supports OpenAI-style tool calling reliably.",
          ],
        };
      }
    } catch {
      return {
        summary: `The assistant called ${name}, but the tool arguments are not valid JSON, so MCP/function execution would fail before the next assistant turn.`,
        evidence: [
          `Tool "${name}" arguments are not valid JSON: ${truncate(rawArguments, 220)}.`,
        ],
        troubleshooting: [
          "Inspect the retained tool_call arguments and raw streamed chunks for truncation or malformed partial JSON.",
          "Lower output pressure or simplify the tool schema so the model emits smaller argument payloads.",
          "If this is specific to one backend or model, compare tool-call behavior on a known-good backend.",
        ],
      };
    }
  }

  return undefined;
}

function detectToolResultError(requestBody: JsonValue | undefined): ToolResultErrorSignal | undefined {
  const toolError = extractToolMessageError(requestBody);
  if (!toolError) {
    return undefined;
  }

  const source = toolError.name ? `tool "${toolError.name}"` : "a tool result";
  return {
    summary: `The next assistant turn was prompted with an error coming back from ${source}, so the model was reasoning on a failed MCP/tool invocation rather than a clean tool result.`,
    evidence: [
      toolError.toolCallId ? `tool_call_id=${toolError.toolCallId}.` : "A tool-role message in the request body contained an error payload.",
      `Tool error: ${truncate(toolError.message, 220)}.`,
    ],
    troubleshooting: [
      "Inspect the MCP or tool implementation that produced the error payload before troubleshooting the model response itself.",
      "Verify that the tool name, schema, and emitted arguments line up with what the server expects.",
      "If the model produced the tool call, compare the requested arguments against a known-good tool invocation and tighten the prompt if necessary.",
    ],
  };
}

function detectInterruptedResponse(
  entry: RequestLogEntry,
  outputText: string,
  responseBody: JsonValue | undefined,
): InterruptedResponseSignal | undefined {
  if (entry.outcome !== "cancelled") {
    return undefined;
  }

  const toolCalls = collectAssistantToolCalls(responseBody);
  const reasoningText = extractPrimaryAssistantReasoning(responseBody);
  if (!outputText && !reasoningText && toolCalls.length === 0 && (entry.completionTokens ?? 0) <= 0) {
    return undefined;
  }

  const evidence = [
    "Stored outcome: cancelled.",
  ];

  if (outputText) {
    evidence.push(`Partial assistant text retained (${outputText.length} chars).`);
  }

  if (reasoningText) {
    evidence.push(`Partial assistant reasoning retained (${reasoningText.length} chars).`);
  }

  if (toolCalls.length > 0) {
    evidence.push(`Partial assistant tool_call payload retained (${toolCalls.length} call${toolCalls.length === 1 ? "" : "s"}).`);
  }

  if ((entry.completionTokens ?? 0) > 0) {
    evidence.push(`Completion had already started (${entry.completionTokens} completion token${entry.completionTokens === 1 ? "" : "s"} recorded).`);
  }

  return {
    summary: "The request was cancelled after the assistant had already started producing a turn, so the retained response is only partial.",
    evidence,
    troubleshooting: [
      "If the cancellation was intentional, treat the stored response as partial and ignore this warning.",
      "If the cancellation was unexpected, inspect client timeouts, dashboard cancels, browser disconnects, or upstream latency spikes.",
      "Retry the request with a higher client timeout or without cancelling to confirm whether the model can complete the turn normally.",
    ],
  };
}

function detectRepeatedLine(text: string): RepetitionSignal | undefined {
  const counts = new Map<string, number>();
  const lines = text
    .split(/\r?\n/g)
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length >= 12);

  for (const line of lines) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }

  const repeated = Array.from(counts.entries())
    .filter((entry) => entry[1] >= 3)
    .sort((left, right) => right[1] - left[1])[0];

  if (!repeated) {
    return undefined;
  }

  return {
    summary: "The assistant output repeats the same line multiple times, which strongly suggests degenerate looping instead of useful progress.",
    evidence: [
      `Repeated line (${repeated[1]}x): "${truncate(repeated[0], 180)}".`,
    ],
    troubleshooting: [
      "Lower max_completion_tokens so the model has less room to get stuck in a loop.",
      "Increase repeat_penalty and consider adding a stop sequence if the answer has a clear terminal pattern.",
      "Tighten the prompt so the model knows when to stop instead of continuing open-ended text.",
    ],
  };
}

function detectRepeatedTailPhrase(text: string): RepetitionSignal | undefined {
  const words = text
    .toLowerCase()
    .split(/\s+/g)
    .filter((word) => word.length > 0);

  if (words.length < 12) {
    return undefined;
  }

  for (let phraseLength = 3; phraseLength <= 10; phraseLength += 1) {
    let repeats = 1;
    let start = words.length - phraseLength;
    const phrase = words.slice(start, start + phraseLength).join(" ");

    while (start - phraseLength >= 0) {
      const previous = words.slice(start - phraseLength, start).join(" ");
      if (previous !== phrase) {
        break;
      }

      repeats += 1;
      start -= phraseLength;
    }

    if (repeats >= 3 && phrase.length >= 16) {
      return {
        summary: "The response tail contains the same phrase repeated several times in a row, which is a classic endless-repetition signal.",
        evidence: [
          `Repeated tail phrase (${repeats}x): "${truncate(phrase, 180)}".`,
        ],
        troubleshooting: [
          "Reduce max_completion_tokens so the model stops earlier instead of burning tokens in a loop.",
          "Increase repeat_penalty and keep temperature/top_p conservative while troubleshooting.",
          "Add an explicit instruction for what the final line should look like, or provide a stop sequence that matches the desired ending.",
        ],
      };
    }
  }

  return undefined;
}

function extractPrimaryAssistantText(value: JsonValue | undefined): string {
  const segments = collectAssistantTextSegments(value);
  return normalizeWhitespace(segments.join("\n\n"));
}

function extractPrimaryAssistantReasoning(value: JsonValue | undefined): string {
  const segments = collectAssistantReasoningSegments(value);
  return normalizeWhitespace(segments.join("\n\n"));
}

function buildResponseBodyPreview(value: JsonValue | undefined): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  const serialized = JSON.stringify(value, null, 2);
  return serialized.length > 6000
    ? `${serialized.slice(0, 5997)}...`
    : serialized;
}

function collectAssistantTextSegments(value: JsonValue | undefined): string[] {
  if (!isJsonRecord(value)) {
    return [];
  }

  const segments: string[] = [];

  if (typeof value.output_text === "string" && value.output_text.trim().length > 0) {
    segments.push(value.output_text.trim());
  }

  if (Array.isArray(value.choices)) {
    for (const choice of value.choices) {
      if (!isJsonRecord(choice)) {
        continue;
      }

      if (typeof choice.text === "string" && choice.text.trim().length > 0) {
        segments.push(choice.text.trim());
      }

      if (isJsonRecord(choice.message)) {
        segments.push(...collectMessageTextSegments(choice.message));
      }
    }
  }

  if (Array.isArray(value.output)) {
    for (const item of value.output) {
      if (isJsonRecord(item)) {
        segments.push(...collectMessageTextSegments(item));
      }
    }
  }

  return segments;
}

function collectAssistantToolCalls(value: JsonValue | undefined): Array<Record<string, JsonValue>> {
  if (!isJsonRecord(value)) {
    return [];
  }

  const toolCalls: Array<Record<string, JsonValue>> = [];

  if (Array.isArray(value.choices)) {
    for (const choice of value.choices) {
      if (!isJsonRecord(choice) || !isJsonRecord(choice.message) || !Array.isArray(choice.message.tool_calls)) {
        continue;
      }

      for (const toolCall of choice.message.tool_calls) {
        if (isJsonRecord(toolCall)) {
          toolCalls.push(toolCall);
        }
      }
    }
  }

  if (Array.isArray(value.output)) {
    for (const item of value.output) {
      if (!isJsonRecord(item) || !Array.isArray(item.tool_calls)) {
        continue;
      }

      for (const toolCall of item.tool_calls) {
        if (isJsonRecord(toolCall)) {
          toolCalls.push(toolCall);
        }
      }
    }
  }

  return toolCalls;
}

function collectAssistantReasoningSegments(value: JsonValue | undefined): string[] {
  if (!isJsonRecord(value)) {
    return [];
  }

  const segments: string[] = [];

  if (Array.isArray(value.choices)) {
    for (const choice of value.choices) {
      if (!isJsonRecord(choice) || !isJsonRecord(choice.message)) {
        continue;
      }

      const reasoning = readStringField(choice.message, ["reasoning_content", "reasoning", "thinking"]);
      if (reasoning) {
        segments.push(reasoning);
      }
    }
  }

  if (Array.isArray(value.output)) {
    for (const item of value.output) {
      if (!isJsonRecord(item)) {
        continue;
      }

      const reasoning = readStringField(item, ["reasoning_content", "reasoning", "thinking"]);
      if (reasoning) {
        segments.push(reasoning);
      }
    }
  }

  return segments;
}

function collectMessageTextSegments(message: Record<string, JsonValue>): string[] {
  const segments: string[] = [];

  if (typeof message.content === "string" && message.content.trim().length > 0) {
    segments.push(message.content.trim());
  }

  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (!isJsonRecord(part)) {
        continue;
      }

      const explicitText = readStringField(part, ["text", "content", "value"]);
      if (explicitText) {
        segments.push(explicitText);
      }
    }
  }

  return segments;
}

function extractToolMessageError(requestBody: JsonValue | undefined): {
  name?: string;
  toolCallId?: string;
  message: string;
} | undefined {
  if (!isJsonRecord(requestBody) || !Array.isArray(requestBody.messages)) {
    return undefined;
  }

  for (const rawMessage of requestBody.messages) {
    if (!isJsonRecord(rawMessage) || rawMessage.role !== "tool") {
      continue;
    }

    const errorMessage = extractErrorMessageFromToolContent(rawMessage.content);
    if (!errorMessage) {
      continue;
    }

    return {
      name: typeof rawMessage.name === "string" && rawMessage.name.length > 0 ? rawMessage.name : undefined,
      toolCallId: typeof rawMessage.tool_call_id === "string" && rawMessage.tool_call_id.length > 0 ? rawMessage.tool_call_id : undefined,
      message: errorMessage,
    };
  }

  return undefined;
}

function extractErrorMessageFromToolContent(value: JsonValue | undefined): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      return extractErrorMessageFromToolContent(JSON.parse(trimmed) as JsonValue);
    } catch {
      return undefined;
    }
  }

  if (Array.isArray(value)) {
    for (const part of value) {
      const nested = extractErrorMessageFromToolContent(part);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  }

  if (!isJsonRecord(value)) {
    return undefined;
  }

  if (isJsonRecord(value.error)) {
    const directMessage = readStringField(value.error, ["message", "detail", "text"]);
    if (directMessage) {
      return directMessage;
    }
  }

  return readStringField(value, ["error", "message", "detail"]);
}

function readToolCallName(toolCall: Record<string, JsonValue>): string | undefined {
  if (!isJsonRecord(toolCall.function)) {
    return undefined;
  }

  return typeof toolCall.function.name === "string" && toolCall.function.name.trim().length > 0
    ? toolCall.function.name.trim()
    : undefined;
}

function readToolCallArguments(toolCall: Record<string, JsonValue>): string | undefined {
  if (!isJsonRecord(toolCall.function) || typeof toolCall.function.arguments !== "string") {
    return undefined;
  }

  const trimmed = toolCall.function.arguments.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readStringField(value: Record<string, JsonValue>, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
    : value;
}

function round(value: number): string {
  return value.toFixed(value >= 100 ? 0 : 1);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function isJsonRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
