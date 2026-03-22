import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SpanKind } from "@opentelemetry/api";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";

import { createConfigTestService } from "../../config/test/runtime-api";
import configSchema from "../config.schema.json";
import { createOtelConfigService, createOtelService } from "../server/otel-capability";

test("otel service exports structured trace spans when enabled", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "otel-service-test-"));
  const exporter = new InMemorySpanExporter();
  const config = createConfigTestService({
    configFilePaths: {
      otel: path.join(tempDir, "config.json"),
    },
    schemas: {
      otel: configSchema,
    },
  });
  config.writeConfigFile("otel", {
    enabled: true,
    serviceName: "llmproxy-test",
    timeoutMs: 2500,
  });

  try {
    const service = await createOtelService({
      configService: createOtelConfigService({ config }),
      createExporter: () => exporter,
    });

    service.traces.record("llmproxy.test", {
      name: "gen_ai.client.chat",
      kind: SpanKind.CLIENT,
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": "demo-model",
      },
    });
    await service.traces.forceFlush();

    const spans = exporter.getFinishedSpans();
    assert.equal(spans.length, 1);
    assert.equal(spans[0]?.name, "gen_ai.client.chat");
    assert.equal(spans[0]?.resource.attributes["service.name"], "llmproxy-test");
    assert.equal(spans[0]?.attributes["gen_ai.operation.name"], "chat");

    await service.stop();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("otel config defaults to disabled metadata-only export", async () => {
  const service = createOtelConfigService({
    config: createConfigTestService({
      schemas: {
        otel: configSchema,
      },
    }),
  });

  const config = await service.load();
  assert.equal(config.enabled, false);
  assert.equal(config.captureMessageContent, false);
  assert.equal(config.captureToolContent, false);
  assert.equal(config.serviceName, "llmproxy");
  assert.equal(config.timeoutMs, 10_000);
});

test("otel config service persists updated exporter settings", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "otel-config-save-test-"));
  const config = createConfigTestService({
    configFilePaths: {
      otel: path.join(tempDir, "config.json"),
    },
    schemas: {
      otel: configSchema,
    },
  });

  try {
    const service = createOtelConfigService({ config });
    service.save({
      enabled: true,
      endpoint: "https://collector.example.com/v1/traces",
      headers: {
        authorization: "Bearer secret-token",
      },
      timeoutMs: 2500,
      serviceName: "llmproxy-prod",
      serviceNamespace: "edge",
      deploymentEnvironment: "production",
      captureMessageContent: true,
      captureToolContent: true,
    });

    const persisted = await service.load();
    assert.equal(persisted.enabled, true);
    assert.equal(persisted.endpoint, "https://collector.example.com/v1/traces");
    assert.deepEqual(persisted.headers, {
      authorization: "Bearer secret-token",
    });
    assert.equal(persisted.timeoutMs, 2500);
    assert.equal(persisted.serviceName, "llmproxy-prod");
    assert.equal(persisted.serviceNamespace, "edge");
    assert.equal(persisted.deploymentEnvironment, "production");
    assert.equal(persisted.captureMessageContent, true);
    assert.equal(persisted.captureToolContent, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("otel service exposes request-scoped export debug metadata", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "otel-service-debug-test-"));
  const requests: Array<{
    headers: Record<string, string | string[] | undefined>;
    body: Uint8Array;
  }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => {
      requests.push({
        headers: request.headers,
        body: new Uint8Array(Buffer.concat(chunks)),
      });
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        partialSuccess: {},
      }));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");

  const config = createConfigTestService({
    configFilePaths: {
      otel: path.join(tempDir, "config.json"),
    },
    schemas: {
      otel: configSchema,
    },
  });
  config.writeConfigFile("otel", {
    enabled: true,
    endpoint: `http://127.0.0.1:${address.port}/v1/traces`,
    headers: {
      authorization: "Bearer secret-token",
    },
    serviceName: "llmproxy-test",
    timeoutMs: 2500,
  });

  try {
    const service = await createOtelService({
      configService: createOtelConfigService({ config }),
    });
    const updates: Array<Record<string, unknown>> = [];
    let resolveFinalUpdate: ((value: Record<string, unknown>) => void) | undefined;
    const finalUpdatePromise = new Promise<Record<string, unknown>>((resolve) => {
      resolveFinalUpdate = resolve;
    });

    service.traces.record("llmproxy.test", {
      name: "gen_ai.client.chat",
      kind: SpanKind.CLIENT,
      attributes: {
        "llmproxy.request.id": "req-otel-debug",
        "gen_ai.operation.name": "chat",
      },
    }, {
      requestId: "req-otel-debug",
      span: {
        name: "gen_ai.client.chat",
        attributes: {
          "gen_ai.operation.name": "chat",
        },
      },
      onUpdate: (debug) => {
        updates.push(debug as unknown as Record<string, unknown>);
        if (debug.pending === false) {
          resolveFinalUpdate?.(debug as unknown as Record<string, unknown>);
        }
      },
    });
    await service.traces.forceFlush();

    const finalUpdate = await finalUpdatePromise;
    assert.equal(requests.length, 1);
    assert.equal((updates[0]?.pending as boolean | undefined), true);
    assert.equal(typeof (finalUpdate.span as Record<string, unknown> | undefined)?.traceId, "string");
    assert.equal(typeof (finalUpdate.span as Record<string, unknown> | undefined)?.spanId, "string");
    assert.equal(((finalUpdate.span as Record<string, unknown> | undefined)?.name), "gen_ai.client.chat");
    assert.equal((((finalUpdate.span as Record<string, unknown> | undefined)?.status as Record<string, unknown> | undefined)?.code), "UNSET");
    assert.equal(finalUpdate.post, undefined);
    assert.equal((((finalUpdate.result as Record<string, unknown> | undefined)?.statusCode) as number | undefined), 200);
    assert.deepEqual((finalUpdate.result as Record<string, unknown> | undefined)?.responseBody, {
      partialSuccess: {},
    });
    assert.equal((requests[0]?.headers.authorization as string | undefined), "Bearer secret-token");
    assert.equal((requests[0]?.headers["content-type"] as string | undefined), "application/x-protobuf");
    assert.ok((requests[0]?.body.length ?? 0) > 0);

    await service.stop();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await rm(tempDir, { recursive: true, force: true });
  }
});
