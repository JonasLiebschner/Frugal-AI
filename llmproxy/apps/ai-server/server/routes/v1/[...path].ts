import { defineEventHandler, setResponseStatus } from "h3";
import {
  applyAiServerPublicCors,
  handleAiServerPublicPreflight,
  isSupportedAiServerPublicPath,
  normalizeAiServerPublicPath,
} from "../../ai-server-public-cors";

export default defineEventHandler(async (event) => {
  const method = event.method;
  const pathname = event.path;
  const normalizedPathname = normalizeAiServerPublicPath(pathname);
  const isSupportedPublicPath = isSupportedAiServerPublicPath(
    pathname,
    event.context.aiProxy.isSupportedPublicPath,
  );

  const preflightResponse = handleAiServerPublicPreflight(
    event,
    event.context.aiProxy.isSupportedPublicPath,
  );
  if (preflightResponse !== undefined) {
    return preflightResponse;
  }

  applyAiServerPublicCors(event);

  if (method === "GET" && normalizedPathname === "/v1/models") {
    return event.context.aiProxy.buildModelsPayload();
  }

  if (method === "POST" && event.context.aiProxy.isSupportedPublicPath(normalizedPathname)) {
    return await event.context.aiProxy.handlePublicRoute(event);
  }

  if (isSupportedPublicPath) {
    setResponseStatus(event, 405);
    return buildProxyError(`Route "${method} ${pathname}" is not available for this HTTP method.`);
  }

  setResponseStatus(event, 501);
  return buildProxyError(
    `Route "${method} ${pathname}" is not implemented. Supported routes: GET /v1/models, POST /v1/chat/completions.`,
  );
});

function buildProxyError(message: string): { error: { message: string; type: string } } {
  return {
    error: {
      message,
      type: "proxy_error",
    },
  };
}
