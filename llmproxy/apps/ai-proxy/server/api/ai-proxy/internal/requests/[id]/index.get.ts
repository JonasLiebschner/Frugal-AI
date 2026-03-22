import {
  defineEventHandler,
  getRouterParam,
  setResponseStatus,
} from "h3";
import { proxyError } from "../../../../../../../shared/server/http-utils";
import { requireAiProxyCapability } from "../../../../../ai-proxy-capability";

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

  return {
    detail,
  };
});
