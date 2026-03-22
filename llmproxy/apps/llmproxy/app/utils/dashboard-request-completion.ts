import type { BackendSnapshot, JsonValue, RequestLogEntry } from "../types/dashboard";
import { isClientRecord } from "./guards";

export function buildCompletionMetricValue(
  entry: RequestLogEntry,
  options?: {
    requestBody?: unknown;
    responseBody?: unknown;
    backends?: BackendSnapshot[];
    live?: boolean;
  },
  servedModelName?: string,
): { value: string; title: string } | null {
  const usedTokens = resolveUsedCompletionTokens(entry, Boolean(options?.live));
  const requestedLimit = resolveRequestedCompletionLimit(options?.requestBody);
  const servedModel = servedModelName ?? resolveServedModelName(options?.responseBody, options?.requestBody, entry.model);
  const modelLimit = resolveModelCompletionLimit(servedModel, entry.backendId, options?.backends);

  if (usedTokens === null) {
    return null;
  }

  const effectiveLimit = resolveEffectiveCompletionLimit(requestedLimit?.value, modelLimit?.value);
  const limitLabel = effectiveLimit === null ? "\u221E" : new Intl.NumberFormat("en-US").format(effectiveLimit);
  const usedLabel = new Intl.NumberFormat("en-US").format(usedTokens);
  const titleParts = [
    "Generated completion tokens reported or inferred for this request.",
  ];

  if (requestedLimit && modelLimit) {
    titleParts.push(
      `Effective limit uses the lower of the request cap (${requestedLimit.value} from ${requestedLimit.source}) and the model cap (${modelLimit.value} from backend model metadata).`,
    );
  } else if (requestedLimit) {
    titleParts.push(`Limit comes from ${requestedLimit.source} (${requestedLimit.value}).`);
  } else if (modelLimit) {
    titleParts.push(`Limit comes from backend model metadata (${modelLimit.value}).`);
  } else {
    titleParts.push("No explicit request-level or model-level completion cap was available, so the limit is treated as unbounded.");
  }

  if (servedModel) {
    titleParts.push(`Resolved model: ${servedModel}.`);
  }

  return {
    value: `${usedLabel} / ${limitLabel} tokens`,
    title: titleParts.join(" "),
  };
}

export function resolveServedModelName(responseBody: unknown, requestBody: unknown, fallbackModel?: string): string | undefined {
  if (isClientRecord(responseBody) && typeof responseBody.model === "string" && responseBody.model.trim().length > 0) {
    return responseBody.model.trim();
  }

  if (isClientRecord(requestBody) && typeof requestBody.model === "string" && requestBody.model.trim().length > 0) {
    return requestBody.model.trim();
  }

  return typeof fallbackModel === "string" && fallbackModel.trim().length > 0
    ? fallbackModel.trim()
    : undefined;
}

function resolveUsedCompletionTokens(entry: RequestLogEntry, live: boolean): number | null {
  if (typeof entry.completionTokens === "number") {
    return entry.completionTokens;
  }

  const derived = (entry.contentTokens ?? 0) + (entry.reasoningTokens ?? 0) + (entry.textTokens ?? 0);
  if (derived > 0) {
    return derived;
  }

  return live ? 0 : null;
}

function resolveRequestedCompletionLimit(requestBody: unknown): { value: number; source: string } | null {
  if (!isClientRecord(requestBody)) {
    return null;
  }

  const maxCompletionTokens = readPositiveInteger(requestBody.max_completion_tokens);
  if (maxCompletionTokens !== null) {
    return {
      value: maxCompletionTokens,
      source: 'request field "max_completion_tokens"',
    };
  }

  const maxTokens = readPositiveInteger(requestBody.max_tokens);
  if (maxTokens !== null) {
    return {
      value: maxTokens,
      source: 'request field "max_tokens"',
    };
  }

  return null;
}

function resolveModelCompletionLimit(
  model: string | undefined,
  backendId: string | undefined,
  backends: BackendSnapshot[] | undefined,
): { value: number; source: string } | null {
  if (!model || !Array.isArray(backends) || backends.length === 0) {
    return null;
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
    if (limit !== null) {
      return {
        value: limit,
        source: `backend "${backend.name}" model metadata`,
      };
    }
  }

  return null;
}

function resolveEffectiveCompletionLimit(
  requestLimit: number | undefined,
  modelLimit: number | undefined,
): number | null {
  if (typeof requestLimit === "number" && typeof modelLimit === "number") {
    return Math.min(requestLimit, modelLimit);
  }

  if (typeof requestLimit === "number") {
    return requestLimit;
  }

  if (typeof modelLimit === "number") {
    return modelLimit;
  }

  return null;
}

function readExplicitModelCompletionLimit(value: unknown): number | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = readExplicitModelCompletionLimit(entry);
      if (nested !== null) {
        return nested;
      }
    }

    return null;
  }

  if (!isJsonRecord(value)) {
    return null;
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
    if (parsed !== null) {
      return parsed;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const nested = readExplicitModelCompletionLimit(nestedValue);
    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function isJsonRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
