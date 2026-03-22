import type { H3Event } from "h3";
import type { LiveRequestState } from "../ai-proxy-types";
import { StreamingAccumulator } from "./streaming";
import {
  createStreamingClientSink,
  type StreamingClientSink,
} from "./proxy-streaming-client";
import {
  consumeOllamaStreamingBuffer,
  consumeOpenAiStreamingBuffer,
} from "./proxy-streaming-consumers";

export async function handleOpenAiStreamingProxy(options: {
  event: H3Event;
  requestState: LiveRequestState;
  requestId: string;
  kind: "chat.completions" | "completions";
  clientStream: boolean;
  backendId: string;
  model?: string;
  routingMiddlewareId?: string;
  routingMiddlewareProfile?: string;
  upstreamResponse: Response;
}): Promise<Record<string, unknown>> {
  const {
    event,
    requestState,
    requestId,
    kind,
    clientStream,
    backendId,
    model,
    routingMiddlewareId,
    routingMiddlewareProfile,
    upstreamResponse,
  } = options;
  const accumulator = new StreamingAccumulator(kind, { preserveFullPayload: !clientStream });
  requestState.updateConnection(requestId, { streamingAccumulator: accumulator });
  const reader = upstreamResponse.body?.getReader();
  const clientSink = clientStream
    ? createStreamingClientSink(
      event,
      upstreamResponse.status,
      requestId,
      backendId,
      model,
      routingMiddlewareId,
      routingMiddlewareProfile,
    )
    : undefined;

  if (!reader) {
    throw new Error("Streaming response had no body.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }

      if (clientSink) {
        await clientSink.write(next.value);
      }

      buffer += decoder.decode(next.value, { stream: true });
      buffer = consumeOpenAiStreamingBuffer(requestState, requestId, buffer, accumulator, false);
    }

    buffer += decoder.decode();
    consumeOpenAiStreamingBuffer(requestState, requestId, buffer, accumulator, true);

    if (!accumulator.hasPayload) {
      throw new Error("Upstream stream produced no JSON payload.");
    }

    const synthesizedResponse = accumulator.buildResponse();

    if (clientSink) {
      await clientSink.close();
    }

    return synthesizedResponse;
  } catch (error) {
    if (clientSink) {
      await clientSink.abort(error);
    }

    throw error;
  }
}

export async function handleOllamaStreamingProxy(options: {
  event: H3Event;
  requestState: LiveRequestState;
  requestId: string;
  clientStream: boolean;
  backendId: string;
  model?: string;
  routingMiddlewareId?: string;
  routingMiddlewareProfile?: string;
  upstreamResponse: Response;
}): Promise<Record<string, unknown>> {
  const {
    event,
    requestState,
    requestId,
    clientStream,
    backendId,
    model,
    routingMiddlewareId,
    routingMiddlewareProfile,
    upstreamResponse,
  } = options;
  const accumulator = new StreamingAccumulator("chat.completions", { preserveFullPayload: !clientStream });
  requestState.updateConnection(requestId, { streamingAccumulator: accumulator });
  const reader = upstreamResponse.body?.getReader();
  const clientSink = clientStream
    ? createStreamingClientSink(
      event,
      upstreamResponse.status,
      requestId,
      backendId,
      model,
      routingMiddlewareId,
      routingMiddlewareProfile,
    )
    : undefined;

  if (!reader) {
    throw new Error("Ollama streaming response had no body.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }

      buffer += decoder.decode(next.value, { stream: true });
      buffer = await consumeOllamaStreamingBuffer(
        requestState,
        requestId,
        buffer,
        accumulator,
        clientSink,
        false,
      );
    }

    buffer += decoder.decode();
    await consumeOllamaStreamingBuffer(
      requestState,
      requestId,
      buffer,
      accumulator,
      clientSink,
      true,
    );

    if (!accumulator.hasPayload) {
      throw new Error("Ollama stream produced no JSON payload.");
    }

    const synthesizedResponse = accumulator.buildResponse();

    if (clientSink) {
      await clientSink.close("data: [DONE]\n\n");
    }

    return synthesizedResponse;
  } catch (error) {
    if (clientSink) {
      await clientSink.abort(error);
    }

    throw error;
  }
}
