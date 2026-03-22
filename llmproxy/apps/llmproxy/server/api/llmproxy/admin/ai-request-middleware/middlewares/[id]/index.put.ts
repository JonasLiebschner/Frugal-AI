import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { replaceAdminAiRequestMiddleware } from "../../../../../../llmproxy-admin";
import { parseAiRequestRoutingMiddlewareSavePayload } from "../../../../../../llmproxy-admin-payloads";
import { parseRequiredJsonBody } from "../../../../../../llmproxy-admin-json";
import { toErrorMessage } from "../../../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  const currentId = getRouterParam(event, "id");
  if (!currentId) {
    setResponseStatus(event, 400);
    return proxyError("Missing middleware id.");
  }

  const parsedBody = await parseRequiredJsonBody(event, parseAiRequestRoutingMiddlewareSavePayload);
  if (!parsedBody.ok) {
    setResponseStatus(event, parsedBody.statusCode);
    return parsedBody.body;
  }

  try {
    const middleware = await replaceAdminAiRequestMiddleware({
      configService: event.context.aiRequestMiddleware.configService,
    }, currentId, parsedBody.value);
    await event.context.aiRequestMiddleware.reload();

    return {
      ok: true,
      middleware,
    };
  } catch (error) {
    setResponseStatus(event, 400);
    return proxyError(toErrorMessage(error));
  }
});
