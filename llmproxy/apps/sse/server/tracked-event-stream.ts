import {
  createEventStream,
  type EventStream,
  type EventStreamMessage,
  type H3Event,
} from "h3";

export class TrackedEventStream {
  private readonly stream: EventStream;
  private readonly closedCallbacks = new Set<() => void>();
  private pushQueue = Promise.resolve();
  private pendingBytes = 0;
  private closed = false;

  public constructor(event: H3Event) {
    this.stream = createEventStream(event);
    this.stream.onClosed(() => {
      this.markClosed();
    });
  }

  public onClosed(callback: () => void): void {
    if (this.closed) {
      callback();
      return;
    }

    this.closedCallbacks.add(callback);
  }

  public getBufferedBytes(): number {
    return this.pendingBytes;
  }

  public hasBackpressure(): boolean {
    return this.pendingBytes > 0;
  }

  public isClosed(): boolean {
    return this.closed;
  }

  public async push(message: EventStreamMessage): Promise<void> {
    if (this.closed) {
      return;
    }

    const queuedBytes = estimateEventMessageBytes(message);
    this.pendingBytes += queuedBytes;

    const sending = this.pushQueue.then(async () => {
      if (this.closed) {
        return;
      }

      await this.stream.push(message);
    });

    this.pushQueue = sending.catch(() => undefined);

    try {
      await sending;
    } catch {
      // Closing/disconnect errors are handled through onClosed and registry cleanup.
    } finally {
      this.pendingBytes = Math.max(0, this.pendingBytes - queuedBytes);
    }
  }

  public async send(): Promise<void> {
    try {
      await this.stream.send();
    } catch {
      // Disconnects are surfaced through onClosed and do not need separate handling here.
    } finally {
      this.markClosed();
    }
  }

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    try {
      await this.pushQueue.catch(() => undefined);
      await this.stream.close();
    } catch {
      this.markClosed();
    }
  }

  private markClosed(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.pendingBytes = 0;
    for (const callback of this.closedCallbacks) {
      callback();
    }
    this.closedCallbacks.clear();
  }
}

function estimateEventMessageBytes(message: EventStreamMessage): number {
  let frame = "";

  if (message.id !== undefined) {
    frame += `id: ${sanitizeSingleLine(String(message.id))}\n`;
  }

  if (message.event !== undefined) {
    frame += `event: ${sanitizeSingleLine(message.event)}\n`;
  }

  if (message.retry !== undefined) {
    frame += `retry: ${sanitizeSingleLine(String(message.retry))}\n`;
  }

  const lines = message.data.split(/\r?\n/);
  for (const line of lines) {
    frame += `data: ${line}\n`;
  }

  return Buffer.byteLength(`${frame}\n`);
}

function sanitizeSingleLine(value: string): string {
  return value.replace(/[\n\r]/g, "");
}
