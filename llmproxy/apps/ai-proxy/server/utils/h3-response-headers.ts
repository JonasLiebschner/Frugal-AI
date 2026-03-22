import { setResponseHeader, type H3Event } from "h3";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

const PROXY_OWNED_HEADERS = new Set([
  "access-control-allow-origin",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-expose-headers",
  "access-control-max-age",
  "access-control-allow-private-network",
  "vary",
]);

export function copyResponseHeaders(headers: Headers, event: H3Event): void {
  headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedKey) || PROXY_OWNED_HEADERS.has(normalizedKey)) {
      return;
    }

    setResponseHeader(event, key, value);
  });
}
