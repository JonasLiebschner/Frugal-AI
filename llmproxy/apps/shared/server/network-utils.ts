type HeaderValue = string | string[] | undefined;
type HeaderSource = Headers | Record<string, HeaderValue>;

export interface ClientIpSource {
  headers: HeaderSource;
  socket?: {
    remoteAddress?: string;
  };
}

export function joinUrl(baseUrl: string, pathAndSearch: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const path = pathAndSearch.startsWith("/") ? pathAndSearch : `/${pathAndSearch}`;
  return `${base}${path}`;
}

export function tryParseJsonBuffer(buffer: Buffer, contentType?: string): Record<string, unknown> | undefined {
  if (buffer.length === 0) {
    return undefined;
  }

  if (!contentType || !contentType.toLowerCase().includes("application/json")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(buffer.toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function extractClientIp(request: ClientIpSource): string | undefined {
  const forwardedFor = readHeaderValue(request.headers, "x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || undefined;
  }

  const forwarded = readHeaderValue(request.headers, "forwarded");
  const forwardedIp = parseForwardedFor(forwarded);
  if (forwardedIp) {
    return forwardedIp;
  }

  const directHeaderIp = firstNonEmptyHeaderValue(
    readHeaderValue(request.headers, "cf-connecting-ip"),
    readHeaderValue(request.headers, "true-client-ip"),
    readHeaderValue(request.headers, "x-real-ip"),
    readHeaderValue(request.headers, "x-client-ip"),
    readHeaderValue(request.headers, "fastly-client-ip"),
  );
  if (directHeaderIp) {
    return directHeaderIp;
  }

  return request.socket?.remoteAddress ?? undefined;
}

function readHeaderValue(headers: HeaderSource, name: string): string | undefined {
  if (headers instanceof Headers) {
    const value = headers.get(name);
    return value?.trim() || undefined;
  }

  return firstHeaderValue(headers[name]);
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0]?.trim() || undefined;
  }

  return undefined;
}

function firstNonEmptyHeaderValue(...values: Array<string | string[] | undefined>): string | undefined {
  for (const value of values) {
    const candidate = firstHeaderValue(value);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function parseForwardedFor(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/for=(?:"?\[?)([^;\],"]+)/i);
  if (!match?.[1]) {
    return undefined;
  }

  const candidate = match[1].trim();
  if (!candidate) {
    return undefined;
  }

  if (candidate.startsWith("_")) {
    return undefined;
  }

  return candidate.replace(/\]$/, "");
}
