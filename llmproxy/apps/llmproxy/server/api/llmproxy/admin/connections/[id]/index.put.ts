import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import {
  replaceAdminConnection,
  requireLlmproxyAdminAiProxy,
} from "../../../../../llmproxy-admin";
import { parseConnectionSavePayload } from "../../../../../llmproxy-admin-payloads";
import { toErrorMessage } from "../../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../../shared/server/http-utils";
import { parseRequiredJsonBody } from "../../../../../llmproxy-admin-json";

export default defineEventHandler(async (event) => {
  const parsedBody = await parseRequiredJsonBody(event, parseConnectionSavePayload);
  if (!parsedBody.ok) {
    setResponseStatus(event, parsedBody.statusCode);
    return parsedBody.body;
  }

  try {
    const aiProxy = await requireLlmproxyAdminAiProxy(event);
    const connection = await replaceAdminConnection({
      configService: aiProxy.configService,
      loadBalancer: aiProxy.loadBalancer,
    }, getRouterParam(event, "id") ?? "", parsedBody.value);
    return { ok: true, connection };
  } catch (error) {
    setResponseStatus(event, 400);
    return proxyError(toErrorMessage(error));
  }
});
