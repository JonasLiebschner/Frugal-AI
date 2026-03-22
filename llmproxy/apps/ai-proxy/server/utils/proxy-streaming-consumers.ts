import {
  convertOllamaChunkToOpenAiChunk,
  splitJsonLines,
} from "../../../ai-client/server/ai-client-capability";
import type { LiveRequestState } from "../ai-proxy-types";
import {
  extractSseDataPayload,
  splitSseBlocks,
  StreamingAccumulator,
} from "./streaming";
import type { StreamingClientSink } from "./proxy-streaming-client";

export function consumeOpenAiStreamingBuffer(
  requestState: LiveRequestState,
  requestId: string,
  buffer: string,
  accumulator: StreamingAccumulator,
  flush: boolean,
): string {
  const split = splitSseBlocks(buffer, flush);

  for (const block of split.blocks) {
    const payloadText = extractSseDataPayload(block);
    if (!payloadText || payloadText === "[DONE]") {
      continue;
    }

    try {
      const payload = JSON.parse(payloadText) as Record<string, unknown>;
      applyStreamingAccumulatorUpdate(requestState, requestId, accumulator, payload);
    } catch {
      continue;
    }
  }

  return split.remainder;
}

export async function consumeOllamaStreamingBuffer(
  requestState: LiveRequestState,
  requestId: string,
  buffer: string,
  accumulator: StreamingAccumulator,
  clientSink: StreamingClientSink | undefined,
  flush: boolean,
): Promise<string> {
  const split = splitJsonLines(buffer, flush);

  for (const line of split.lines) {
    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const chunk = convertOllamaChunkToOpenAiChunk(payload, requestId);
    if (!chunk) {
      continue;
    }

    if (clientSink) {
      await clientSink.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    applyStreamingAccumulatorUpdate(requestState, requestId, accumulator, chunk);
  }

  return split.remainder;
}

function applyStreamingAccumulatorUpdate(
  requestState: LiveRequestState,
  requestId: string,
  accumulator: StreamingAccumulator,
  payload: Record<string, unknown>,
): void {
  const update = accumulator.applyPayload(payload);
  requestState.applyStreamingUpdate(
    requestId,
    update,
    requestState.hasRequestDetailSubscribers(requestId) ? accumulator.buildResponse() : undefined,
  );
}
