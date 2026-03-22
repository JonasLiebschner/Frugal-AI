import { defineEventHandler, setResponseStatus } from "h3";
import {
  readAdminConnectionState,
  requireLlmproxyAdminAiProxy,
} from "../../../../llmproxy-admin";
import { toErrorMessage } from "../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  try {
    const aiProxy = await requireLlmproxyAdminAiProxy(event);
    const state = await readAdminConnectionState({
      configService: aiProxy.configService,
      loadBalancer: aiProxy.loadBalancer,
    });
    return {
      ...state,
      mcpEnabled: event.context.mcpServer.isEnabled(),
    };
  } catch (error) {
    setResponseStatus(event, 500);
    return proxyError(toErrorMessage(error));
  }
});
