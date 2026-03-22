import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import type { NitroApp } from "nitropack";

import { setupAiClientNitroPlugin } from "../../ai-client/server/ai-client-nitro";
import type { AiClientNitroCapability } from "../../ai-client/server/ai-client-capability";
import { ensureAiProxyNitroCapability } from "../server/ai-proxy-capability";
import { setupAiProxyNitroPlugin } from "../server/ai-proxy-nitro";
import type { AiProxyNitroCapability } from "../server/ai-proxy-runtime";

type HookHandler = (...args: any[]) => unknown | Promise<unknown>;
type TestAiClientService = AiClientNitroCapability & {
  stop: () => Promise<void>;
};

function createDeferred<TValue>() {
  let resolve!: (value: TValue | PromiseLike<TValue>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function createFakeNitroApp() {
  const hookMap = new Map<string, HookHandler[]>();

  return {
    $sse: {
      isEnabled: () => true,
    },
    hooks: {
      hook(name: string, handler: HookHandler) {
        const handlers = hookMap.get(name) ?? [];
        handlers.push(handler);
        hookMap.set(name, handlers);
      },
      hookOnce(name: string, handler: HookHandler) {
        const wrapped: HookHandler = async (...args: any[]) => {
          await handler(...args);
        };
        const handlers = hookMap.get(name) ?? [];
        handlers.push(wrapped);
        hookMap.set(name, handlers);
      },
    },
    async callHook(name: string, ...args: any[]) {
      for (const handler of hookMap.get(name) ?? []) {
        await handler(...args);
      }
    },
  } as unknown as NitroApp & {
    callHook: (name: string, ...args: any[]) => Promise<void>;
  };
}

function createAiClientCapability(): AiClientNitroCapability {
  return {
    configService: {
      configPath: ".data/config/ai-client/config.json",
      load: async () => ({
        requestTimeoutMs: 1,
        queueTimeoutMs: 1,
        healthCheckIntervalMs: 1,
        recentRequestLimit: 1,
        connections: [],
      }),
      loadEditableConfig: async () => ({
        requestTimeoutMs: 1,
        queueTimeoutMs: 1,
        healthCheckIntervalMs: 1,
        recentRequestLimit: 1,
        connections: [],
      }),
      listEditableConnections: async () => [],
      createConnection: async () => {
        throw new Error("not implemented");
      },
      replaceConnection: async () => {
        throw new Error("not implemented");
      },
      updateConnection: async () => {
        throw new Error("not implemented");
      },
      updateAiClientSettings: async () => {
        throw new Error("not implemented");
      },
      deleteConnection: async () => {
        throw new Error("not implemented");
      },
    },
    loadBalancer: {
      getAiClientSettings: () => ({
        requestTimeoutMs: 1,
        queueTimeoutMs: 1,
        healthCheckIntervalMs: 1,
        recentRequestLimit: 1,
      }),
      replaceConfig: () => undefined,
      getSnapshot: () => ({
        startedAt: new Date(0).toISOString(),
        queueDepth: 0,
        recentRequestLimit: 1,
        totals: {
          activeRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          cancelledRequests: 0,
          rejectedRequests: 0,
        },
        backends: [],
        activeConnections: [],
        recentRequests: [],
      }),
      listKnownModels: () => [],
      getRequestLogDetail: () => undefined,
      acquire: async () => {
        throw new Error("not implemented");
      },
      on: () => undefined,
      off: () => undefined,
      stop: async () => undefined,
    },
  } as unknown as AiClientNitroCapability;
}

function createAiProxyCapability(
  aiClient: AiClientNitroCapability,
): AiProxyNitroCapability {
  return {
    configService: aiClient.configService,
    loadBalancer: aiClient.loadBalancer,
    requestState: {
      start: async () => undefined,
      stop: async () => undefined,
      openRequestDetailSse: async () => undefined,
      openDashboardSse: async () => undefined,
      inspectActiveConnection: () => undefined,
      getDashboardSseClientCount: () => 0,
      getSseBufferedBytes: () => 0,
      cancelActiveRequest: () => false,
      hasActiveConnection: () => false,
      getActiveConnection: () => undefined,
      listActiveConnections: () => [],
      setCancelHandler: () => undefined,
      hasRequestDetailSubscribers: () => false,
      getSnapshot: () => ({
        startedAt: new Date(0).toISOString(),
        queueDepth: 0,
        recentRequestLimit: 1,
        totals: {
          activeRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          cancelledRequests: 0,
          rejectedRequests: 0,
        },
        backends: [],
        activeConnections: [],
        recentRequests: [],
      }),
      getRequestDetail: () => undefined,
      getDiagnosticsReport: () => undefined,
      trackConnection: () => undefined,
      startConnectionEnergyTracking: () => undefined,
      updateConnection: () => undefined,
      applyStreamingUpdate: () => undefined,
      removeConnection: () => undefined,
      buildReleaseMetrics: () => ({}),
    },
    buildHealthPayload: () => ({
      status: "ok",
      queueDepth: 0,
      backends: 0,
      healthyBackends: 0,
    }),
    buildModelsPayload: () => ({ object: "list", data: [] }),
    isSupportedPublicPath: () => true,
    handlePublicRoute: async () => undefined,
    stop: async () => undefined,
  };
}

test("ai-proxy nitro runtime waits for ai-client startup before attaching request context", async () => {
  const nitroApp = createFakeNitroApp();
  const aiClientDeferred = createDeferred<TestAiClientService>();

  setupAiProxyNitroPlugin(
    nitroApp,
    async (aiClient) => createAiProxyCapability(aiClient),
  );
  setupAiClientNitroPlugin(
    nitroApp,
    async () => await aiClientDeferred.promise,
  );

  const event = {
    context: {},
    node: {
      req: new EventEmitter(),
      res: new EventEmitter(),
    },
  } as any;
  const requestHook = nitroApp.callHook("request", event);

  aiClientDeferred.resolve({
    ...createAiClientCapability(),
    stop: async () => undefined,
  });
  await requestHook;

  assert.ok(event.context.aiClient);
  assert.ok(event.context.aiProxy);
  assert.equal(typeof nitroApp.$aiProxy?.buildHealthPayload, "function");
});

test("ai-proxy nitro capability can be resolved directly from nitro state", async () => {
  const nitroApp = createFakeNitroApp();
  let createCalls = 0;

  nitroApp.$sse = {
    isEnabled: () => true,
  } as any;
  nitroApp.$aiClientReady = Promise.resolve(createAiClientCapability());

  const aiProxy = await ensureAiProxyNitroCapability(
    nitroApp,
    async (aiClient) => {
      createCalls += 1;
      return createAiProxyCapability(aiClient);
    },
  );
  const aiProxyAgain = await ensureAiProxyNitroCapability(
    nitroApp,
    async () => {
      createCalls += 1;
      throw new Error("should not be called twice");
    },
  );

  assert.equal(createCalls, 1);
  assert.equal(aiProxy, aiProxyAgain);
  assert.equal(nitroApp.$aiProxy, aiProxy);
});
