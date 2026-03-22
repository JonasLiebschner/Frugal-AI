import { defineEventHandler, setResponseStatus } from "h3";
import {
  requireLlmproxyAdminAiProxy,
  updateAdminAiClientSettings,
} from "../../../../llmproxy-admin";
import { parseAiClientSettingsSavePayload } from "../../../../llmproxy-admin-payloads";
import { toErrorMessage } from "../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../shared/server/http-utils";
import { parseRequiredJsonBody } from "../../../../llmproxy-admin-json";

export default defineEventHandler(async (event) => {
  const parsedBody = await parseRequiredJsonBody(event, parseAiClientSettingsSavePayload);
  if (!parsedBody.ok) {
    setResponseStatus(event, parsedBody.statusCode);
    return parsedBody.body;
  }

  try {
    const aiProxy = await requireLlmproxyAdminAiProxy(event);
    const update = await updateAdminAiClientSettings({
      configService: aiProxy.configService,
      loadBalancer: aiProxy.loadBalancer,
    }, parsedBody.value);
    return {
      ok: true,
      settings: update.persistedAiClientSettings,
      appliedImmediatelyFields: update.appliedImmediatelyFields,
    };
  } catch (error) {
    setResponseStatus(event, 400);
    return proxyError(toErrorMessage(error));
  }
});
