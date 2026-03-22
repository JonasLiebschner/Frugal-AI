import { defineEventHandler, setResponseStatus } from "h3";
import { readAdminMcpClientServers } from "../../../../../llmproxy-admin";
import { toErrorMessage } from "../../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  try {
    const servers = await readAdminMcpClientServers({
      configService: event.context.mcpClient.configService,
    });
    return {
      ok: true,
      data: servers,
    };
  } catch (error) {
    setResponseStatus(event, 500);
    return proxyError(toErrorMessage(error));
  }
});
