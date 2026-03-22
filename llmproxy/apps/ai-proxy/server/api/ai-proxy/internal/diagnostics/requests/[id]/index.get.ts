import {
  defineEventHandler,
  getRouterParam,
  setResponseStatus,
} from "h3";
import { buildDiagnosticPromptContextPayload } from "../../../../../../ai-proxy-diagnostics";
import { proxyError } from "../../../../../../../../shared/server/http-utils";
import { requireAiProxyCapability } from "../../../../../../ai-proxy-capability";

export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, "id");
  const aiProxy = await requireAiProxyCapability(event);
  if (!requestId) {
    setResponseStatus(event, 404);
    return proxyError("Recent request was not found.");
  }

  const detail = aiProxy.requestState.getRequestDetail(requestId);
  if (!detail) {
    setResponseStatus(event, 404);
    return proxyError(`Recent request "${requestId}" was not found.`);
  }

  const snapshot = aiProxy.requestState.getSnapshot();
  const diagnostics = aiProxy.requestState.getDiagnosticsReport(detail.entry.id);

  if (!diagnostics) {
    setResponseStatus(event, 404);
    return proxyError(`Recent request "${detail.entry.id}" was not found.`);
  }

  return {
    detail: diagnostics.detail,
    report: diagnostics.report,
    promptContext: buildDiagnosticPromptContextPayload(
      diagnostics.detail,
      snapshot,
    ),
  };
});
