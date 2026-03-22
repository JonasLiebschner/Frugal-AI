const BLOCKED_EXACT_HEADERS = new Set([
  "expect",
  "origin",
  "priority",
  "referer",
  "x-ai-proxy-request-id",
]);

export function shouldForwardUpstreamHeader(headerName: string): boolean {
  const lowerName = headerName.trim().toLowerCase();

  if (!lowerName) {
    return false;
  }

  if (BLOCKED_EXACT_HEADERS.has(lowerName)) {
    return false;
  }

  if (lowerName.startsWith("sec-")) {
    return false;
  }

  return true;
}
