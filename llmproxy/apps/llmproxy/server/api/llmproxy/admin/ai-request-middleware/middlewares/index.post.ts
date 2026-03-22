import { defineEventHandler, setResponseStatus } from "h3";
import { createAdminAiRequestMiddleware } from "../../../../../llmproxy-admin";
import { parseAiRequestRoutingMiddlewareSavePayload } from "../../../../../llmproxy-admin-payloads";
import { parseRequiredJsonBody } from "../../../../../llmproxy-admin-json";
import { toErrorMessage } from "../../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  const parsedBody = await parseRequiredJsonBody(event, parseAiRequestRoutingMiddlewareSavePayload);
  if (!parsedBody.ok) {
    setResponseStatus(event, parsedBody.statusCode);
    return parsedBody.body;
  }

  try {
    const middleware = await createAdminAiRequestMiddleware({
      configService: event.context.aiRequestMiddleware.configService,
    }, parsedBody.value);
    await event.context.aiRequestMiddleware.reload();

    setResponseStatus(event, 201);
    return {
      ok: true,
      middleware,
    };
  } catch (error) {
    setResponseStatus(event, 400);
    return proxyError(toErrorMessage(error));
  }
});
