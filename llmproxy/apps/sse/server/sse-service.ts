import {
  type SseCapability,
  type SseTopicDefinition,
  type SseTopicProvider,
} from "./sse-capability";
import { SseTopicRegistry } from "./sse-client-registry";

export const DEFAULT_MAX_SSE_CLIENT_BUFFER_BYTES = 4_000_000;

export function createSseService(
  maxClientBufferBytes = DEFAULT_MAX_SSE_CLIENT_BUFFER_BYTES,
): SseCapability {
  const registry = new SseTopicRegistry(maxClientBufferBytes);

  return {
    isEnabled: () => true,
    registerHandler: registry.registerTopicProvider.bind(registry),
    registerTopic: registry.registerTopic.bind(registry),
    listTopics: registry.listTopics.bind(registry),
    getTopic: registry.getTopic.bind(registry),
    hasSubscribers: registry.hasSubscribers.bind(registry),
    getTopicClientCount: registry.getTopicClientCount.bind(registry),
    getBufferedBytes: registry.getBufferedBytes.bind(registry),
    openTopicStream: registry.openTopicStream.bind(registry),
    broadcastTopic: registry.broadcastTopic.bind(registry),
    broadcastHeartbeat: registry.broadcastHeartbeat.bind(registry),
    closeTopicSubscribers: registry.closeTopicSubscribers.bind(registry),
    closeAll: registry.closeAll.bind(registry),
  };
}

export type { SseTopicDefinition, SseTopicProvider };
