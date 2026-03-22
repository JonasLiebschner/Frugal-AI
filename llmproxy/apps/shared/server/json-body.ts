import { readValidatedBody, type H3Event } from "h3";

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJsonObjectBody(event: H3Event): Promise<Record<string, unknown> | undefined> {
  const contentType = event.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  try {
    return await readValidatedBody<Record<string, unknown>>(event, (value) => isJsonObject(value));
  } catch {
    return undefined;
  }
}
