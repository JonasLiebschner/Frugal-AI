import { defineEventHandler, getRouterParam, setResponseStatus } from "h3";
import { replaceAdminMcpClientServer } from "../../../../../../llmproxy-admin";
import { parseMcpClientServerSavePayload } from "../../../../../../llmproxy-admin-payloads";
import { toErrorMessage } from "../../../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../../../shared/server/http-utils";
import { parseRequiredJsonBody } from "../../../../../../llmproxy-admin-json";

export default defineEventHandler(async (event) => {
  const parsedBody = await parseRequiredJsonBody(event, parseMcpClientServerSavePayload);
  if (!parsedBody.ok) {
    setResponseStatus(event, parsedBody.statusCode);
    return parsedBody.body;
  }

  try {
    const server = await replaceAdminMcpClientServer({
      configService: event.context.mcpClient.configService,
    }, getRouterParam(event, "id") ?? "", parsedBody.value);
    return { ok: true, server };
  } catch (error) {
    setResponseStatus(event, 400);
    return proxyError(toErrorMessage(error));
  }
});
