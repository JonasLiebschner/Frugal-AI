export {
  createAiClientConfigService,
  createAiClientNitroCapability,
  LoadBalancer,
} from "./ai-client-runtime";
export {
  buildBackendRequestPlan,
  buildOllamaChatRequestBody,
  convertOllamaChunkToOpenAiChunk,
  getBackendConnector,
  getDefaultHealthPaths,
  isOllamaNdjson,
  splitJsonLines,
} from "./ai-client-backend-connectors";
export {
  buildAiClientGenAiRequestTrace,
  buildAiClientGenAiRequestTraceDebugSpan,
  recordAiClientGenAiRequestTrace,
  aiClientOtelScopeName,
} from "./ai-client-genai-telemetry";
export {
  DEFAULT_AI_CLIENT_SETTINGS,
  materializeConnectionConfig,
  normalizeAiClientConfig,
  normalizeAiClientSettings,
  resolveConnectionHeaders,
  serializeAiClientConfig,
  toConnectionEditorConfig,
} from "./ai-client-config";
export {
  buildDiagnosticPrompt,
  buildDiagnosticPromptContextPayload,
  buildDiagnosticPromptFromContext,
  buildDiagnosticReport,
  listDiagnosticPrompts,
  selectPrimaryDiagnosticIssue,
} from "./ai-client-diagnostics";
export {
  extractErrorMessageFromPayload,
  resolveEffectiveCompletionTokenLimit,
  resolveModelCompletionLimit,
  resolveRequestedCompletionLimit,
} from "./ai-client-diagnostic-http";

import type { AiClientConfigService as PublicAiClientConfigService } from "./ai-client-config-types";
import type {
  AiClientLoadBalancer,
  DiagnosticIssueSummary,
  DiagnosticPromptContextPayload,
  DiagnosticPromptDefinition,
  DiagnosticPromptMessage,
  DiagnosticPromptName,
  DiagnosticReport,
  DiagnosticFinding,
  DiagnosticFact,
  DiagnosticSeverity,
} from "./ai-client-types";

export type { PublicAiClientConfigService as AiClientConfigService };
export type {
  AiClientLoadBalancer,
  DiagnosticFact,
  DiagnosticFinding,
  DiagnosticIssueSummary,
  DiagnosticPromptContextPayload,
  DiagnosticPromptDefinition,
  DiagnosticPromptMessage,
  DiagnosticPromptName,
  DiagnosticReport,
  DiagnosticSeverity,
};

export interface AiClientNitroCapability {
  configService: PublicAiClientConfigService;
  loadBalancer: AiClientLoadBalancer;
}
