import type { JsonValue, ProxySnapshot } from "../../shared/type-api";

export function extractErrorMessageFromPayload(value: JsonValue | undefined): string | undefined {
  const message = extractNestedErrorMessage(value, 0);
  if (typeof message !== "string" || message.trim().length === 0) {
    return undefined;
  }

  return sanitizeUpstreamErrorMessage(message);
}

export function resolveRequestedCompletionLimit(requestBody: JsonValue | undefined): number | undefined {
  if (!isJsonRecord(requestBody)) {
    return undefined;
  }

  const maxCompletionTokens = readPositiveInteger(requestBody.max_completion_tokens);
  if (maxCompletionTokens !== undefined) {
    return maxCompletionTokens;
  }

  return readPositiveInteger(requestBody.max_tokens);
}

export function resolveModelCompletionLimit(
  model: string | undefined,
  backendId: string | undefined,
  backends: ProxySnapshot["backends"],
): number | undefined {
  if (!model || backends.length === 0) {
    return undefined;
  }

  const preferredBackends = backendId
    ? backends.filter((backend) => backend.id === backendId)
    : backends;
  const candidateBackends = preferredBackends.length > 0 ? preferredBackends : backends;

  for (const backend of candidateBackends) {
    const detail = backend.discoveredModelDetails.find((entry) => {
      if (entry.id === model) {
        return true;
      }

      if (!isJsonRecord(entry.metadata)) {
        return false;
      }

      const aliases = entry.metadata.aliases;
      return Array.isArray(aliases) && aliases.some((alias) => alias === model);
    });

    const limit = readExplicitModelCompletionLimit(detail?.metadata);
    if (limit !== undefined) {
      return limit;
    }
  }

  return undefined;
}

export function resolveEffectiveCompletionTokenLimit(
  requestLimit: number | undefined,
  modelLimit: number | undefined,
): number | undefined {
  if (typeof requestLimit === "number" && typeof modelLimit === "number") {
    return Math.min(requestLimit, modelLimit);
  }

  if (typeof requestLimit === "number") {
    return requestLimit;
  }

  if (typeof modelLimit === "number") {
    return modelLimit;
  }

  return undefined;
}

function sanitizeUpstreamErrorMessage(message: string): string {
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

function readExplicitModelCompletionLimit(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = readExplicitModelCompletionLimit(entry);
      if (nested !== undefined) {
        return nested;
      }
    }

    return undefined;
  }

  if (!isJsonRecord(value)) {
    return undefined;
  }

  const explicitKeys = [
    "max_completion_tokens",
    "max_output_tokens",
    "max_generated_tokens",
    "completion_token_limit",
    "output_token_limit",
    "num_predict",
  ];

  for (const key of explicitKeys) {
    const parsed = readPositiveInteger(value[key]);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const nested = readExplicitModelCompletionLimit(nestedValue);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
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
