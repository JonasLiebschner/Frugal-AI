import type { EventStreamMessage, H3Event } from "h3";

export { createSseService } from "./sse-runtime";

export interface SseTopicDefinition {
  id: string;
  title?: string;
  description?: string;
}

export type SseTopicProvider = () => SseTopicDefinition | SseTopicDefinition[];

export interface OpenTopicStreamOptions {
  keepOpen?: boolean;
}

export interface SseCapability {
  isEnabled: () => boolean;
  registerHandler: (provider: SseTopicProvider | SseTopicProvider[]) => SseTopicProvider[];
  registerTopic: (topic: SseTopicDefinition | SseTopicDefinition[]) => SseTopicDefinition[];
  listTopics: () => SseTopicDefinition[];
  getTopic: (topicId: string) => SseTopicDefinition | undefined;
  hasSubscribers: (topicId: string) => boolean;
  getTopicClientCount: (topicId?: string) => number;
  getBufferedBytes: () => number;
  openTopicStream: (
    event: H3Event,
    topicId: string,
    initialPayload: EventStreamMessage,
    options?: OpenTopicStreamOptions,
  ) => Promise<void>;
  broadcastTopic: (
    topicId: string,
    payload: EventStreamMessage,
    closeAfterBroadcast?: boolean,
  ) => void;
  broadcastHeartbeat: (payload: EventStreamMessage) => void;
  closeTopicSubscribers: (topicId: string) => void;
  closeAll: () => Promise<void>;
}

export type SseHandlerRegistrar = Pick<SseCapability, "registerHandler">;
export type SseService = SseCapability;
