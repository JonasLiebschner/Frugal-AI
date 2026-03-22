import type { H3Event } from "h3";
import { toErrorMessage } from "../../shared/server/core-utils";
import { proxyError } from "../../shared/server/http-utils";
import { readJsonObjectBody } from "../../shared/server/json-body";

interface ParsedJsonBody<T> {
  ok: true;
  value: T;
}

interface InvalidJsonBody {
  ok: false;
  statusCode: number;
  body: ReturnType<typeof proxyError>;
}

function buildInvalidJsonBody(message: string): InvalidJsonBody {
  return {
    ok: false,
    statusCode: 400,
    body: proxyError(message),
  };
}

async function readAdminJsonObjectBody(event: H3Event): Promise<Record<string, unknown> | undefined> {
  return readJsonObjectBody(event);
}

export async function parseRequiredJsonBody<T>(
  event: H3Event,
  parser: (value: Record<string, unknown>) => T,
  errorMessage = "Expected a JSON body.",
): Promise<ParsedJsonBody<T> | InvalidJsonBody> {
  const parsed = await readAdminJsonObjectBody(event);
  if (!parsed) {
    return buildInvalidJsonBody(errorMessage);
  }

  try {
    return {
      ok: true,
      value: parser(parsed),
    };
  } catch (error) {
    return buildInvalidJsonBody(toErrorMessage(error));
  }
}
