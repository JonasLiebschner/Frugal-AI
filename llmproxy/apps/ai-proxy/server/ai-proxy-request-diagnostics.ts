import { buildDiagnosticReport } from "../../ai-client/server/ai-client-capability";
import type { ProxySnapshot, RequestLogDetail } from "../../shared/type-api";

export interface RequestDiagnosticsContext {
  getSnapshot(): ProxySnapshot;
  getRequestDetail(requestId: string): RequestLogDetail | undefined;
}

export function getDiagnosticsReport(
  context: RequestDiagnosticsContext,
  requestId: string,
): {
  detail: RequestLogDetail;
  report: ReturnType<typeof buildDiagnosticReport>;
} | undefined {
  const detail = context.getRequestDetail(requestId);
  if (!detail) {
    return undefined;
  }

  return {
    detail,
    report: buildDiagnosticReport(detail, context.getSnapshot()),
  };
}
