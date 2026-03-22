import {
  getHeader,
  setResponseHeader,
  setResponseStatus,
  type H3Event,
} from "h3";

const PUBLIC_CORS_ALLOWED_METHODS = "GET, POST, OPTIONS";
const PUBLIC_CORS_DEFAULT_ALLOWED_HEADERS = "authorization, content-type, x-ai-proxy-request-id";
const PUBLIC_CORS_EXPOSED_HEADERS = "x-ai-proxy-request-id, x-ai-proxy-backend, x-ai-proxy-model, x-ai-proxy-routing-middleware, x-ai-proxy-routing-outcome";
const PUBLIC_CORS_MAX_AGE_SECONDS = 86400;

export function applyAiServerPublicCors(event: H3Event): void {
  const requestOrigin = getHeader(event, "origin")?.trim();
  if (requestOrigin) {
    setResponseHeader(event, "access-control-allow-origin", requestOrigin);
    appendVaryHeader(event, "origin");
  } else {
    setResponseHeader(event, "access-control-allow-origin", "*");
  }

  setResponseHeader(event, "access-control-allow-methods", PUBLIC_CORS_ALLOWED_METHODS);
  setResponseHeader(event, "access-control-expose-headers", PUBLIC_CORS_EXPOSED_HEADERS);
  setResponseHeader(event, "access-control-max-age", PUBLIC_CORS_MAX_AGE_SECONDS);

  const requestedHeaders = getHeader(event, "access-control-request-headers")?.trim();
  if (requestedHeaders) {
    setResponseHeader(event, "access-control-allow-headers", requestedHeaders);
    appendVaryHeader(event, "access-control-request-headers");
  } else {
    setResponseHeader(event, "access-control-allow-headers", PUBLIC_CORS_DEFAULT_ALLOWED_HEADERS);
  }

  const requestedPrivateNetwork = getHeader(event, "access-control-request-private-network")?.trim();
  if (requestedPrivateNetwork?.toLowerCase() === "true") {
    setResponseHeader(event, "access-control-allow-private-network", "true");
    appendVaryHeader(event, "access-control-request-private-network");
  }
}

export function isSupportedAiServerPublicPath(
  pathname: string,
  isSupportedProxyPath: (pathname: string) => boolean,
): boolean {
  const normalizedPathname = normalizeAiServerPublicPath(pathname);
  return normalizedPathname === "/v1/models" || isSupportedProxyPath(normalizedPathname);
}

export function handleAiServerPublicPreflight(
  event: H3Event,
  isSupportedProxyPath: (pathname: string) => boolean,
): "" | undefined {
  if (event.method?.toUpperCase() !== "OPTIONS") {
    return undefined;
  }

  applyAiServerPublicCors(event);
  if (!isSupportedAiServerPublicPath(event.path, isSupportedProxyPath)) {
    return undefined;
  }

  setResponseStatus(event, 204);
  return "";
}

export function normalizeAiServerPublicPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "");
  }

  return pathname;
}

function appendVaryHeader(event: H3Event, value: string): void {
  const current = getHeader(event, "vary")?.trim();
  if (!current) {
    setResponseHeader(event, "vary", value);
    return;
  }

  const values = current.split(",").map((entry) => entry.trim().toLowerCase());
  if (values.includes(value.toLowerCase())) {
    return;
  }

  setResponseHeader(event, "vary", `${current}, ${value}`);
}
