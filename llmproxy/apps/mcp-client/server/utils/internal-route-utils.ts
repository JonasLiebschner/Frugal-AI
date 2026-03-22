import type { H3Event } from "h3";
import { createError, getRouterParam } from "h3";

import type { McpPromptCompletionRequest } from "../mcp-client-types";
import { isRecord } from "../../../shared/server/type-guards";

export function requireRouteParam(event: H3Event, name: string): string {
  const value = getRouterParam(event, name);
  if (!value) {
    throw createError({
      statusCode: 400,
      statusMessage: `Missing "${name}" route parameter.`,
    });
  }

  return value;
}

export function asStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      typeof entryValue === "string"
        ? entryValue
        : String(entryValue ?? ""),
    ]),
  );
}

export function normalizePromptCompletionRequest(
  value: unknown,
): McpPromptCompletionRequest {
  if (!isRecord(value)) {
    return {
      argumentName: "",
      value: "",
      contextArguments: {},
    };
  }

  return {
    argumentName: typeof value.argumentName === "string"
      ? value.argumentName
      : "",
    value: typeof value.value === "string"
      ? value.value
      : "",
    contextArguments: asStringRecord(value.contextArguments),
  };
}
