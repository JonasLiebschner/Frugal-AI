export async function readErrorResponse(response: Response): Promise<string> {
  const text = await response.text();

  try {
    const payload = JSON.parse(text);
    if (payload?.error?.message) {
      return payload.error.message;
    }
  } catch {
    return text || `HTTP ${response.status}`;
  }

  return text || `HTTP ${response.status}`;
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await readErrorResponse(response));
  }

  return await response.json() as T;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return typeof value === "object" && value !== null && "aborted" in value;
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function createTimeoutSignal(sourceSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();

  if (sourceSignal?.aborted) {
    controller.abort(sourceSignal.reason);
    return {
      signal: controller.signal,
      cleanup: () => undefined,
    };
  }

  const timeoutId = setTimeout(() => {
    controller.abort(createAbortError(`Request timed out after ${timeoutMs} ms.`));
  }, timeoutMs);

  const abortFromSource = () => {
    controller.abort(sourceSignal?.reason);
  };

  if (sourceSignal) {
    sourceSignal.addEventListener("abort", abortFromSource, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      if (sourceSignal) {
        sourceSignal.removeEventListener("abort", abortFromSource);
      }
    },
  };
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const { timeoutMs = 8000, signal, ...requestInit } = init;

  if (!(timeoutMs > 0)) {
    return await fetchImpl(input, { ...requestInit, ...(signal !== undefined ? { signal } : {}) });
  }

  const { signal: timeoutSignal, cleanup } = createTimeoutSignal(isAbortSignal(signal) ? signal : undefined, timeoutMs);

  try {
    return await fetchImpl(input, {
      ...requestInit,
      signal: timeoutSignal,
    });
  } catch (error) {
    if (timeoutSignal.aborted && !signal?.aborted && timeoutSignal.reason instanceof Error) {
      throw timeoutSignal.reason;
    }

    throw error;
  } finally {
    cleanup();
  }
}

export async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const response = await fetchWithTimeout(input, init, fetchImpl);
  return await readJsonResponse<T>(response);
}
