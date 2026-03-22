import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { deleteAdminMcpClientServer } from "../../../../../../llmproxy-admin";
import { toErrorMessage } from "../../../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, "id") ?? "";
  try {
    await deleteAdminMcpClientServer({
      configService: event.context.mcpClient.configService,
    }, serverId);
    return { ok: true, serverId };
  } catch (error) {
    setResponseStatus(event, 404);
    return proxyError(toErrorMessage(error));
  }
});
