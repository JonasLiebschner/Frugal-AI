import { proxyError } from "../../../shared/server/http-utils";
import type { JsonValue } from "../../../shared/type-api";

const SUPPORTED_PROXY_ROUTE_SUMMARY = "Supported routes: GET /v1/models, POST /v1/chat/completions.";

export { proxyError };

export function buildProxyMethodNotAllowedMessage(method: string, pathname: string): string {
  return `Route "${method} ${pathname}" is not available for this HTTP method.`;
}

export function buildProxyNotImplementedMessage(method: string, pathname: string): string {
  return `Route "${method} ${pathname}" is not implemented. ${SUPPORTED_PROXY_ROUTE_SUMMARY}`;
}

export function selectProxyStatus(
  message: string,
  aborted: boolean,
  clientDisconnected: boolean,
  dashboardCancelled: boolean,
): number {
  if (aborted && clientDisconnected) {
    return 499;
  }

  if (aborted && dashboardCancelled) {
    return 409;
  }

  if (message.includes("Timed out after") && message.includes("waiting for a free backend slot")) {
    return 503;
  }

  if (message.includes("No backend")) {
    return 503;
  }

  if (message.includes("Upstream timeout")) {
    return 504;
  }

  return 502;
}

export function isErrorStatus(statusCode: number | undefined): boolean {
  return typeof statusCode === "number" && (statusCode < 200 || statusCode >= 300);
}

export function sanitizeUpstreamErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return trimmed;
  }

  const sanitized = trimmed
    .replace(/\s*Sorry about that!\s*/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();

  return sanitized || trimmed;
}

export function extractErrorMessageFromPayload(value: JsonValue | undefined): string | undefined {
  const message = extractNestedErrorMessage(value, 0);
  if (typeof message !== "string" || message.trim().length === 0) {
    return undefined;
  }

  return sanitizeUpstreamErrorMessage(message);
}

export function sanitizeUpstreamErrorPayloadForClient(value: JsonValue | undefined): JsonValue | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeUpstreamErrorMessage(value);
  }

  if (Array.isArray(value)) {
    let changed = false;
    const sanitized = value.map((entry) => {
      const nextEntry = sanitizeUpstreamErrorPayloadForClient(entry);
      if (nextEntry !== entry) {
        changed = true;
      }

      return nextEntry as JsonValue;
    });

    return changed ? sanitized : value;
  }

  if (!isJsonRecord(value)) {
    return value;
  }

  let changed = false;
  const sanitizedEntries = Object.entries(value).map(([key, entry]) => {
    const nextEntry = sanitizeUpstreamErrorPayloadForClient(entry);
    if (nextEntry !== entry) {
      changed = true;
    }

    return [key, nextEntry] as const;
  });

  return changed ? Object.fromEntries(sanitizedEntries) as JsonValue : value;
}

function extractNestedErrorMessage(value: JsonValue | undefined, depth: number): string | undefined {
  if (depth > 5 || value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractNestedErrorMessage(entry, depth + 1);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  }

  if (!isJsonRecord(value)) {
    return undefined;
  }

  const directError = value.error;
  if (typeof directError === "string" && directError.trim().length > 0) {
    return directError.trim();
  }

  const directMessage = readNonEmptyString(value, ["message", "detail", "reason", "title"]);
  if (directMessage) {
    return directMessage;
  }

  const nestedError = extractNestedErrorMessage(directError, depth + 1);
  if (nestedError) {
    return nestedError;
  }

  const nestedErrors = extractNestedErrorMessage(value.errors, depth + 1);
  if (nestedErrors) {
    return nestedErrors;
  }

  for (const nestedValue of Object.values(value)) {
    if (!Array.isArray(nestedValue) && !isJsonRecord(nestedValue)) {
      continue;
    }

    const nested = extractNestedErrorMessage(nestedValue, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function readNonEmptyString(value: Record<string, JsonValue>, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

function isJsonRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
