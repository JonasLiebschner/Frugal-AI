import { sendStream, setResponseHeader, setResponseStatus, type H3Event } from "h3";
import { buildProxyRouteResponseHeaders } from "./proxy-route-response-headers";

export interface StreamingClientSink {
  abort(error?: unknown): Promise<void>;
  close(finalChunk?: string | Uint8Array): Promise<void>;
  write(chunk: string | Uint8Array): Promise<void>;
}

export async function pipeClientResponseStream(
  event: H3Event,
  stream: ReadableStream<Uint8Array>,
): Promise<void> {
  const clientStream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = clientStream.writable.getWriter();
  const sending = sendStream(event, clientStream.readable);
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      await writer.write(value);
    }

    await writer.close();
    await sending;
  } catch (error) {
    await writer.abort(error).catch(() => {});
    await sending.catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function createStreamingClientSink(
  event: H3Event,
  statusCode: number,
  requestId: string,
  backendId: string,
  model?: string,
  routingMiddlewareId?: string,
  routingMiddlewareProfile?: string,
): StreamingClientSink {
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  let closed = false;

  setResponseStatus(event, statusCode);
  setResponseHeader(event, "content-type", "text/event-stream; charset=utf-8");
  setResponseHeader(event, "cache-control", "no-cache, no-transform");
  setResponseHeader(event, "connection", "keep-alive");
  setResponseHeader(event, "x-accel-buffering", "no");
  const responseHeaders = buildProxyRouteResponseHeaders({
    requestId,
    backendId,
    model,
    routingMiddlewareId,
    routingMiddlewareProfile,
  });
  for (const [name, value] of Object.entries(responseHeaders)) {
    setResponseHeader(event, name, value);
  }
  const sending = sendStream(event, stream.readable);

  return {
    async abort(error?: unknown): Promise<void> {
      if (closed) {
        await sending.catch(() => {});
        return;
      }

      closed = true;
      await writer.abort(error).catch(() => {});
      await sending.catch(() => {});
    },
    async close(finalChunk?: string | Uint8Array): Promise<void> {
      if (closed) {
        await sending;
        return;
      }

      if (finalChunk !== undefined) {
        await writer.write(encodeStreamingChunk(encoder, finalChunk));
      }

      closed = true;
      await writer.close();
      await sending;
    },
    async write(chunk: string | Uint8Array): Promise<void> {
      if (closed) {
        return;
      }

      await writer.write(encodeStreamingChunk(encoder, chunk));
    },
  };
}

function encodeStreamingChunk(encoder: TextEncoder, chunk: string | Uint8Array): Uint8Array {
  return typeof chunk === "string" ? encoder.encode(chunk) : chunk;
}
