import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import {
  parseConnectionPatch,
  patchAdminConnection,
  requireLlmproxyAdminAiProxy,
} from "../../../../../llmproxy-admin";
import { toErrorMessage } from "../../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../../shared/server/http-utils";
import { parseRequiredJsonBody } from "../../../../../llmproxy-admin-json";

export default defineEventHandler(async (event) => {
  const parsedBody = await parseRequiredJsonBody(event, parseConnectionPatch);
  if (!parsedBody.ok) {
    setResponseStatus(event, parsedBody.statusCode);
    return parsedBody.body;
  }

  const connectionId = getRouterParam(event, "id") ?? "";
  try {
    const aiProxy = await requireLlmproxyAdminAiProxy(event);
    await patchAdminConnection({
      configService: aiProxy.configService,
      loadBalancer: aiProxy.loadBalancer,
    }, connectionId, parsedBody.value);
    return { ok: true, connectionId, patch: parsedBody.value };
  } catch (error) {
    setResponseStatus(event, 404);
    return proxyError(toErrorMessage(error));
  }
});
