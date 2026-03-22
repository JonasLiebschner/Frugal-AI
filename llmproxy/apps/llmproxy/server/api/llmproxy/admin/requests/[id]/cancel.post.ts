import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { requireLlmproxyAdminAiProxy } from "../../../../../llmproxy-admin";
import { proxyError } from "../../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  const requestId = getRouterParam(event, "id") ?? "";
  const aiProxy = await requireLlmproxyAdminAiProxy(event);

  if (!requestId) {
    setResponseStatus(event, 404);
    return proxyError("Live request was not found.");
  }

  if (!aiProxy.requestState.cancelActiveRequest(requestId)) {
    setResponseStatus(event, 404);
    return proxyError(`Live request "${requestId}" is no longer active.`);
  }

  setResponseStatus(event, 202);
  return { ok: true, requestId };
});
