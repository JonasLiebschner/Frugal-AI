import { defineEventHandler, setResponseStatus } from "h3";

import { toOtelPublicConfig } from "../../../../../../otel/otel-public-config";
import { toErrorMessage } from "../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  try {
    const config = await event.context.otel.configService.load();

    return {
      ok: true,
      config: toOtelPublicConfig(config),
    };
  } catch (error) {
    setResponseStatus(event, 500);
    return proxyError(toErrorMessage(error));
  }
});
