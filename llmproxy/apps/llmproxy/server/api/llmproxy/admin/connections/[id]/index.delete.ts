import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import {
  deleteAdminConnection,
  requireLlmproxyAdminAiProxy,
} from "../../../../../llmproxy-admin";
import { toErrorMessage } from "../../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  const connectionId = getRouterParam(event, "id") ?? "";
  try {
    const aiProxy = await requireLlmproxyAdminAiProxy(event);
    await deleteAdminConnection({
      configService: aiProxy.configService,
      loadBalancer: aiProxy.loadBalancer,
    }, connectionId);
    return { ok: true, connectionId };
  } catch (error) {
    setResponseStatus(event, 404);
    return proxyError(toErrorMessage(error));
  }
});
