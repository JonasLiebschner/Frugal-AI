import { defineEventHandler, setResponseStatus } from "h3";
import { readAdminAiRequestMiddlewares } from "../../../../../llmproxy-admin";
import { toErrorMessage } from "../../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  try {
    const middlewares = await readAdminAiRequestMiddlewares({
      configService: event.context.aiRequestMiddleware.configService,
    });

    return {
      ok: true,
      data: middlewares,
    };
  } catch (error) {
    setResponseStatus(event, 500);
    return proxyError(toErrorMessage(error));
  }
});
