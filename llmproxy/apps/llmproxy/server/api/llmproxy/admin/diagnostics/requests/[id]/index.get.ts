import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { requireLlmproxyAdminAiProxy } from "../../../../../../llmproxy-admin";
import { proxyError } from "../../../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, "id") ?? "";
  const aiProxy = await requireLlmproxyAdminAiProxy(event);
  const report = aiProxy.requestState.getDiagnosticsReport(requestId);

  if (!report) {
    setResponseStatus(event, 404);
    return proxyError(`Recent request "${requestId}" was not found.`);
  }

  return report;
});
