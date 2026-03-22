import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { requireLlmproxyAdminAiProxy } from "../../../../../llmproxy-admin";
import { proxyError } from "../../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, "id") ?? "";
  const aiProxy = await requireLlmproxyAdminAiProxy(event);

  if (!requestId) {
    setResponseStatus(event, 404);
    return proxyError("Request details were not found.");
  }

  const detail = aiProxy.requestState.getRequestDetail(requestId);
  if (!detail) {
    setResponseStatus(event, 404);
    return proxyError(`Recent request "${requestId}" was not found.`);
  }

  return detail;
});
