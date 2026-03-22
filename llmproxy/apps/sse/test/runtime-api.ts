import type { TestLayerRuntime } from "../../shared/test/test-layer-runtime";
import { createSseService, type SseService } from "../server/sse-capability";

export interface SseTestRuntimeOptions {
  maxSseClientBufferBytes?: number;
}

export interface SseTestRuntime extends TestLayerRuntime { sse: SseService; }

export function createSseTestRuntime(options: SseTestRuntimeOptions = {}): SseTestRuntime {
  return {
    sse: createSseService(options.maxSseClientBufferBytes),
  };
}
