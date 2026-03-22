export function buildStreamingRequestBody(parsedBody: Record<string, unknown>): Buffer {
  return Buffer.from(JSON.stringify({
    ...parsedBody,
    stream: true,
  }));
}
