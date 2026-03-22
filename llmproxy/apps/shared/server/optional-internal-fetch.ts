import type { RequestFetch } from "./request-fetch";

export async function fetchOptionalInternalPayload<T>(
  requestFetch: RequestFetch,
  path: string,
): Promise<T | undefined> {
  try {
    return await requestFetch<T>(path);
  } catch (error) {
    if (isInternalFetchNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

function isInternalFetchNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("statusCode" in error && error.statusCode === 404) {
    return true;
  }

  if ("status" in error && error.status === 404) {
    return true;
  }

  if ("response" in error && typeof error.response === "object" && error.response !== null && "status" in error.response) {
    return error.response.status === 404;
  }

  return false;
}
