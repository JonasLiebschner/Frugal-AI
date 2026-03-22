import type { EventStreamMessage, H3Event } from "h3";
import { TrackedEventStream } from "./tracked-event-stream";
import type {
  OpenTopicStreamOptions,
  SseTopicDefinition,
  SseTopicProvider,
} from "./sse-capability";

interface SseClient {
  stream: TrackedEventStream;
}

export class SseTopicRegistry {
  private readonly topics = new Map<string, SseTopicDefinition>();
  private readonly topicProviders = new Set<SseTopicProvider>();
  private readonly topicClients = new Map<string, Set<SseClient>>();
  private readonly backpressureSince = new WeakMap<SseClient, number>();
  private readonly burstBytes = new WeakMap<SseClient, { startedAt: number; bytes: number }>();

  public constructor(private readonly maxClientBufferBytes: number) {}

  public registerTopic(topic: SseTopicDefinition | SseTopicDefinition[]): SseTopicDefinition[] {
    const topics = Array.isArray(topic) ? topic : [topic];
    for (const entry of topics) {
      this.topics.set(entry.id, { ...entry });
    }

    return topics;
  }

  public registerTopicProvider(provider: SseTopicProvider | SseTopicProvider[]): SseTopicProvider[] {
    const providers = Array.isArray(provider) ? provider : [provider];

    for (const entry of providers) {
      if (this.topicProviders.has(entry)) {
        continue;
      }

      this.topicProviders.add(entry);
      this.registerTopic(entry());
    }

    return providers;
  }

  public listTopics(): SseTopicDefinition[] {
    return Array.from(this.topics.values())
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((topic) => ({ ...topic }));
  }

  public getTopic(topicId: string): SseTopicDefinition | undefined {
    const topic = this.topics.get(topicId);
    return topic ? { ...topic } : undefined;
  }

  public hasSubscribers(topicId: string): boolean {
    return (this.topicClients.get(topicId)?.size ?? 0) > 0;
  }

  public getTopicClientCount(topicId?: string): number {
    if (topicId) {
      return this.topicClients.get(topicId)?.size ?? 0;
    }

    return Array.from(this.allClients()).length;
  }

  public async openTopicStream(
    event: H3Event,
    topicId: string,
    initialPayload: EventStreamMessage,
    options: OpenTopicStreamOptions = {},
  ): Promise<void> {
    this.ensureTopic(topicId);

    const client = this.createClient(event);
    if (options.keepOpen !== false) {
      const clients = this.topicClients.get(topicId) ?? new Set<SseClient>();
      clients.add(client);
      this.topicClients.set(topicId, clients);
      client.stream.onClosed(() => {
        this.unregisterClient(client);
      });
    }

    const sending = client.stream.send();
    await client.stream.push(initialPayload);
    this.dropClientIfNeeded(client, initialPayload.data);

    if (options.keepOpen === false) {
      await client.stream.close();
    }

    await sending;
  }

  public broadcastHeartbeat(payload: EventStreamMessage): void {
    for (const client of this.allClients()) {
      this.writeFrame(client, payload);
    }
  }

  public broadcastTopic(
    topicId: string,
    payload: EventStreamMessage,
    closeAfterBroadcast = false,
  ): void {
    const clients = this.topicClients.get(topicId);
    if (!clients || clients.size === 0) {
      return;
    }

    for (const client of Array.from(clients)) {
      this.writeFrame(client, payload);
      if (closeAfterBroadcast) {
        this.unregisterClient(client);
        void client.stream.close();
      }
    }
  }

  public closeTopicSubscribers(topicId: string): void {
    const clients = this.topicClients.get(topicId);
    if (!clients || clients.size === 0) {
      return;
    }

    for (const client of Array.from(clients)) {
      this.unregisterClient(client);
      void client.stream.close();
    }
  }

  public async closeAll(): Promise<void> {
    for (const client of this.allClients()) {
      await client.stream.close();
    }

    this.topicClients.clear();
  }

  public getBufferedBytes(): number {
    return Array.from(this.allClients()).reduce(
      (sum, client) => sum + client.stream.getBufferedBytes(),
      0,
    );
  }

  private ensureTopic(topicId: string): void {
    if (!this.topics.has(topicId)) {
      this.topics.set(topicId, { id: topicId });
    }
  }

  private createClient(event: H3Event): SseClient {
    return {
      stream: new TrackedEventStream(event),
    };
  }

  private writeFrame(client: SseClient, payload: EventStreamMessage): void {
    if (this.shouldDropClient(client)) {
      this.dropClient(client);
      return;
    }

    void client.stream.push(payload).then(() => {
      this.dropClientIfNeeded(client, payload.data);
    });
  }

  private dropClientIfNeeded(client: SseClient, payload: string): void {
    if (client.stream.hasBackpressure()) {
      const backpressureSince = this.backpressureSince.get(client) ?? Date.now();
      this.backpressureSince.set(client, backpressureSince);
      if (this.shouldDropClient(client) || Date.now() - backpressureSince >= 200) {
        this.dropClient(client);
      }
      return;
    }

    this.backpressureSince.delete(client);
    if (this.shouldDropClient(client) || this.shouldDropClientForBurst(client, payload)) {
      this.dropClient(client);
    }
  }

  private shouldDropClient(client: SseClient): boolean {
    if (client.stream.isClosed()) {
      return true;
    }

    return client.stream.getBufferedBytes() > this.maxClientBufferBytes;
  }

  private shouldDropClientForBurst(client: SseClient, payload: string): boolean {
    const now = Date.now();
    const payloadBytes = Buffer.byteLength(payload);
    const current = this.burstBytes.get(client);
    const withinBurstWindow = current !== undefined && now - current.startedAt <= 5_000;
    const windowStart = withinBurstWindow ? current.startedAt : now;
    const bytes = (withinBurstWindow ? current.bytes : 0) + payloadBytes;

    this.burstBytes.set(client, {
      startedAt: windowStart,
      bytes,
    });

    return bytes > this.maxClientBufferBytes;
  }

  private dropClient(client: SseClient): void {
    this.backpressureSince.delete(client);
    this.burstBytes.delete(client);
    this.unregisterClient(client);
    void client.stream.close();
  }

  private allClients(): Set<SseClient> {
    const clients = new Set<SseClient>();
    for (const topicClients of this.topicClients.values()) {
      for (const client of topicClients) {
        clients.add(client);
      }
    }

    return clients;
  }

  private unregisterClient(client: SseClient): void {
    this.backpressureSince.delete(client);
    this.burstBytes.delete(client);
    for (const [topicId, clients] of this.topicClients.entries()) {
      if (!clients.has(client)) {
        continue;
      }

      clients.delete(client);
      if (clients.size === 0) {
        this.topicClients.delete(topicId);
      }
    }
  }
}
