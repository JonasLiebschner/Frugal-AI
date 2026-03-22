import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createConfigTestService } from "../../config/test/runtime-api";
import type { AiClientConfig } from "../../shared/type-api";
import {
  createAiClientConfigService,
  type AiClientConfigService,
} from "../server/ai-client-capability";

const TEST_CONFIG: AiClientConfig = {
  requestTimeoutMs: 600_000,
  queueTimeoutMs: 30_000,
  healthCheckIntervalMs: 10_000,
  recentRequestLimit: 1000,
  connections: [
    {
      id: "primary",
      name: "Primary",
      baseUrl: "http://127.0.0.1:8080",
      connector: "openai",
      enabled: true,
      maxConcurrency: 1,
      healthPath: "/v1/models",
      models: ["*"],
      headers: {
        "x-test-header": "alpha",
      },
      apiKey: "secret-token",
      apiKeyEnv: "PRIMARY_API_KEY",
      timeoutMs: 12_000,
      monitoringTimeoutMs: 8_000,
      monitoringIntervalMs: 18_000,
      energyUsageUrl: "http://127.0.0.1:9100/energy",
    },
  ],
};

async function withConfigService(
  run: (service: AiClientConfigService, configPath: string) => Promise<void>,
): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-client-config-service-"));
  const configPath = path.join(tempDir, "config.json");

  await writeFile(configPath, `${JSON.stringify(TEST_CONFIG, null, 2)}\n`, "utf8");

  try {
    const config = createConfigTestService({
      configFilePaths: {
        "ai-client": configPath,
      },
    });
    await run(createAiClientConfigService({ config }), configPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("lists editable connections without exposing stored API keys", async () => {
  await withConfigService(async (service) => {
    const connections = await service.listEditableConnections();
    assert.equal(connections.length, 1);
    assert.deepEqual(connections[0], {
      id: "primary",
      name: "Primary",
      baseUrl: "http://127.0.0.1:8080",
      connector: "openai",
      enabled: true,
      maxConcurrency: 1,
      healthPath: "/v1/models",
      models: ["*"],
      headers: {
        "x-test-header": "alpha",
      },
      apiKeyEnv: "PRIMARY_API_KEY",
      apiKeyConfigured: true,
      timeoutMs: 12_000,
      monitoringTimeoutMs: 8_000,
      monitoringIntervalMs: 18_000,
      energyUsageUrl: "http://127.0.0.1:9100/energy",
    });
  });
});

test("creates a connection and writes it to config", async () => {
  await withConfigService(async (service, configPath) => {
    const result = await service.createConnection({
      id: "secondary",
      name: "Secondary",
      baseUrl: "https://ollama.example.com",
      connector: "llama.cpp",
      enabled: false,
      maxConcurrency: 2,
      healthPath: "/v1/models",
      models: ["llama3.2", "qwen2.5"],
      headers: {
        "x-cluster": "gpu-a",
      },
      apiKey: "secondary-secret",
      timeoutMs: 30_000,
      monitoringTimeoutMs: 7_500,
      monitoringIntervalMs: 25_000,
      energyUsageUrl: "https://ollama.example.com/energy",
    });

    assert.equal(result.connection.id, "secondary");
    assert.equal(result.connection.connector, "llama.cpp");
    assert.equal(result.connection.apiKeyConfigured, true);
    assert.equal(result.config.connections.length, 2);

    const persisted = JSON.parse(await readFile(configPath, "utf8")) as AiClientConfig;
    const created = persisted.connections.find((connection) => connection.id === "secondary");

    assert.deepEqual(created, {
      id: "secondary",
      name: "Secondary",
      baseUrl: "https://ollama.example.com",
      connector: "llama.cpp",
      enabled: false,
      maxConcurrency: 2,
      healthPath: "/v1/models",
      models: ["llama3.2", "qwen2.5"],
      headers: {
        "x-cluster": "gpu-a",
      },
      apiKey: "secondary-secret",
      timeoutMs: 30_000,
      monitoringTimeoutMs: 7_500,
      monitoringIntervalMs: 25_000,
      energyUsageUrl: "https://ollama.example.com/energy",
    });
  });
});

test("replaces a connection, keeps stored api keys unless cleared, and supports renaming", async () => {
  await withConfigService(async (service, configPath) => {
    const firstUpdate = await service.replaceConnection("primary", {
      id: "primary-renamed",
      name: "Primary Renamed",
      baseUrl: "http://127.0.0.1:9090",
      connector: "openai",
      enabled: true,
      maxConcurrency: 3,
      healthPath: "/healthz",
      models: ["gpt-*"],
      headers: {
        "x-test-header": "beta",
      },
      apiKeyEnv: "PRIMARY_RENAMED_API_KEY",
      timeoutMs: 15_000,
      monitoringTimeoutMs: 9_000,
      monitoringIntervalMs: 12_000,
      energyUsageUrl: "http://127.0.0.1:9090/energy",
    });

    assert.equal(firstUpdate.connection.id, "primary-renamed");
    assert.equal(firstUpdate.connection.apiKeyConfigured, true);

    let persisted = JSON.parse(await readFile(configPath, "utf8")) as AiClientConfig;
    let updated = persisted.connections.find((connection) => connection.id === "primary-renamed");

    assert.deepEqual(updated, {
      id: "primary-renamed",
      name: "Primary Renamed",
      baseUrl: "http://127.0.0.1:9090",
      connector: "openai",
      enabled: true,
      maxConcurrency: 3,
      healthPath: "/healthz",
      models: ["gpt-*"],
      headers: {
        "x-test-header": "beta",
      },
      apiKey: "secret-token",
      apiKeyEnv: "PRIMARY_RENAMED_API_KEY",
      timeoutMs: 15_000,
      monitoringTimeoutMs: 9_000,
      monitoringIntervalMs: 12_000,
      energyUsageUrl: "http://127.0.0.1:9090/energy",
    });

    const secondUpdate = await service.replaceConnection("primary-renamed", {
      id: "primary-renamed",
      name: "Primary Renamed",
      baseUrl: "http://127.0.0.1:9090",
      connector: "openai",
      enabled: true,
      maxConcurrency: 3,
      healthPath: "/healthz",
      models: ["gpt-*"],
      headers: {
        "x-test-header": "beta",
      },
      apiKeyEnv: "PRIMARY_RENAMED_API_KEY",
      clearApiKey: true,
      timeoutMs: 15_000,
      monitoringTimeoutMs: 9_000,
      monitoringIntervalMs: 12_000,
      energyUsageUrl: "http://127.0.0.1:9090/energy",
    });

    assert.equal(secondUpdate.connection.apiKeyConfigured, false);

    persisted = JSON.parse(await readFile(configPath, "utf8")) as AiClientConfig;
    updated = persisted.connections.find((connection) => connection.id === "primary-renamed");
    assert.equal(updated?.apiKey, undefined);
  });
});

test("deletes a connection and persists the removal", async () => {
  await withConfigService(async (service, configPath) => {
    const next = await service.deleteConnection("primary");

    assert.equal(next.connections.length, 0);

    const persisted = JSON.parse(await readFile(configPath, "utf8")) as AiClientConfig;
    assert.deepEqual(persisted.connections, []);
  });
});

test("updates ai-client settings and persists them", async () => {
  await withConfigService(async (service, configPath) => {
    const next = await service.updateAiClientSettings({
      requestTimeoutMs: 120_000,
      queueTimeoutMs: 45_000,
      healthCheckIntervalMs: 5_000,
      recentRequestLimit: 250,
    });

    assert.deepEqual(
      {
        requestTimeoutMs: next.requestTimeoutMs,
        queueTimeoutMs: next.queueTimeoutMs,
        healthCheckIntervalMs: next.healthCheckIntervalMs,
        recentRequestLimit: next.recentRequestLimit,
      },
      {
        requestTimeoutMs: 120_000,
        queueTimeoutMs: 45_000,
        healthCheckIntervalMs: 5_000,
        recentRequestLimit: 250,
      },
    );
    assert.equal(next.connections.length, 1);
    const persisted = JSON.parse(await readFile(configPath, "utf8")) as AiClientConfig;
    assert.deepEqual(
      {
        requestTimeoutMs: persisted.requestTimeoutMs,
        queueTimeoutMs: persisted.queueTimeoutMs,
        healthCheckIntervalMs: persisted.healthCheckIntervalMs,
        recentRequestLimit: persisted.recentRequestLimit,
      },
      {
        requestTimeoutMs: 120_000,
        queueTimeoutMs: 45_000,
        healthCheckIntervalMs: 5_000,
        recentRequestLimit: 250,
      },
    );
  });
});

test("creates a default config file in the config app data directory when no config exists", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-client-config-service-missing-"));
  const configPath = path.join(tempDir, ".data", "config", "ai-client", "config.json");

  try {
    const config = createConfigTestService({
      configFilePaths: {
        "ai-client": configPath,
      },
    });
    const service = createAiClientConfigService({ config });
    const next = await service.load();

    assert.deepEqual(next, {
      requestTimeoutMs: 600_000,
      queueTimeoutMs: 30_000,
      healthCheckIntervalMs: 10_000,
      recentRequestLimit: 1000,
      connections: [],
    });
    const persisted = JSON.parse(await readFile(configPath, "utf8")) as AiClientConfig;
    assert.deepEqual(persisted, next);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("rejects unsupported root properties in persisted ai-client config files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-client-config-service-invalid-"));
  const configPath = path.join(tempDir, "config.json");

  await writeFile(
    configPath,
    `${JSON.stringify({
      server: {
        requestTimeoutMs: 1234,
      },
      backends: [],
    }, null, 2)}\n`,
    "utf8",
  );

  try {
    const config = createConfigTestService({
      configFilePaths: {
        "ai-client": configPath,
      },
    });
    const service = createAiClientConfigService({ config });

    await assert.rejects(
      async () => await service.load(),
      /Unsupported root properties: "server", "backends"\./,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
