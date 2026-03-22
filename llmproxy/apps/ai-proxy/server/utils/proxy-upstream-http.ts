import { shouldForwardUpstreamHeader } from "./proxy-headers";
import { extractErrorMessageFromPayload } from "./proxy-error-utils";
import type { BackendLease, JsonValue } from "../../../shared/type-api";

const BLOCKED_UPSTREAM_HEADERS = new Set([
  "content-length",
  "host",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
]);

export function buildUpstreamHeaders(
  requestHeaders: Headers,
  lease: BackendLease,
  clientIp?: string,
  forwardedProto = "http",
): Headers {
  const headers = new Headers();
  requestHeaders.forEach((value, key) => {
    const lowerKey = key.toLowerCase();

    if (value === undefined || BLOCKED_UPSTREAM_HEADERS.has(lowerKey) || !shouldForwardUpstreamHeader(lowerKey)) {
      return;
    }

    headers.set(lowerKey, value);
  });

  if (clientIp) {
    headers.set("x-forwarded-for", clientIp);
  }

  const hostHeader = requestHeaders.get("host");
  if (hostHeader) {
    headers.set("x-forwarded-host", hostHeader);
  }

  headers.set("x-forwarded-proto", forwardedProto);
  headers.set("x-ai-proxy-backend", lease.backend.id);

  for (const [key, value] of Object.entries(lease.resolvedHeaders)) {
    headers.set(key, value);
  }

  return headers;
}

export async function readOllamaErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown };
    const errorMessage = extractErrorMessageFromPayload(body as JsonValue);
    if (errorMessage) {
      return errorMessage;
    }
  } catch {
    // ignore parse failure and fall back to generic error
  }

  return `Ollama backend returned HTTP ${response.status}.`;
}

export function parseRetainedUpstreamResponseBody(
  body: Buffer,
  contentType: string | null,
): JsonValue | undefined {
  if (body.length === 0) {
    return undefined;
  }

  const normalizedContentType = contentType?.toLowerCase() ?? "";
  const text = body.toString("utf8");
  const trimmed = text.trim();

  if (
    normalizedContentType.includes("json")
    || normalizedContentType.includes("+json")
    || trimmed.startsWith("{")
    || trimmed.startsWith("[")
  ) {
    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      if (trimmed.length > 0) {
        return text;
      }
    }
  }

  if (
    normalizedContentType.startsWith("text/")
    || normalizedContentType.includes("xml")
    || normalizedContentType.includes("javascript")
    || normalizedContentType.includes("charset=")
  ) {
    return text;
  }

  return undefined;
}

export function buildClientUpstreamErrorBuffer(
  payload: JsonValue | undefined,
  fallbackBody: Buffer,
): Buffer {
  if (payload === undefined) {
    return fallbackBody;
  }

  if (typeof payload === "string") {
    return payload === fallbackBody.toString("utf8") ? fallbackBody : Buffer.from(payload, "utf8");
  }

  return Buffer.from(JSON.stringify(payload));
}
