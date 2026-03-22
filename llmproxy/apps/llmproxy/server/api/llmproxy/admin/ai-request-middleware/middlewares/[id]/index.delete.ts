import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { deleteAdminAiRequestMiddleware } from "../../../../../../llmproxy-admin";
import { toErrorMessage } from "../../../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  const middlewareId = getRouterParam(event, "id");
  if (!middlewareId) {
    setResponseStatus(event, 400);
    return proxyError("Missing middleware id.");
  }

  try {
    await deleteAdminAiRequestMiddleware({
      configService: event.context.aiRequestMiddleware.configService,
    }, middlewareId);
    await event.context.aiRequestMiddleware.reload();

    return {
      ok: true,
      middlewareId,
    };
  } catch (error) {
    setResponseStatus(event, 400);
    return proxyError(toErrorMessage(error));
  }
});
