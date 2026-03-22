import { defineEventHandler, setResponseStatus } from "h3";

import { toOtelPublicConfig } from "../../../../../../otel/otel-public-config";
import { parseRequiredJsonBody } from "../../../../llmproxy-admin-json";
import { parseOtelConfigSavePayload } from "../../../../llmproxy-admin-payloads";
import { toErrorMessage } from "../../../../../../shared/server/core-utils";
import { proxyError } from "../../../../../../shared/server/http-utils";

export default defineEventHandler(async (event) => {
  const parsedBody = await parseRequiredJsonBody(event, parseOtelConfigSavePayload);
  if (!parsedBody.ok) {
    setResponseStatus(event, parsedBody.statusCode);
    return parsedBody.body;
  }

  try {
    const currentConfig = await event.context.otel.configService.load();
    const nextHeaders = parsedBody.value.headers !== undefined
      ? parsedBody.value.headers
      : (parsedBody.value.clearHeaders ? undefined : currentConfig.headers);

    event.context.otel.configService.save({
      ...currentConfig,
      enabled: parsedBody.value.enabled,
      endpoint: parsedBody.value.endpoint,
      headers: nextHeaders,
      timeoutMs: parsedBody.value.timeoutMs,
      serviceName: parsedBody.value.serviceName,
      serviceNamespace: parsedBody.value.serviceNamespace,
      deploymentEnvironment: parsedBody.value.deploymentEnvironment,
      captureMessageContent: parsedBody.value.captureMessageContent,
      captureToolContent: parsedBody.value.captureToolContent,
    });

    const nextConfig = await event.context.otel.reload();

    return {
      ok: true,
      config: toOtelPublicConfig(nextConfig),
    };
  } catch (error) {
    setResponseStatus(event, 400);
    return proxyError(toErrorMessage(error));
  }
});
