export {
  buildDiagnosticPrompt,
  buildDiagnosticPromptContextPayload,
  buildDiagnosticPromptFromContext,
  buildDiagnosticReport,
  listDiagnosticPrompts,
} from "../../ai-client/server/ai-client-capability";
export { getDiagnosticsReport } from "./ai-proxy-request-diagnostics";

export type { DiagnosticPromptContextPayload } from "../../ai-client/server/ai-client-capability";
