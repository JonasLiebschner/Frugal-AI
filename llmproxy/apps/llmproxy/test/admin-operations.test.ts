import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminMcpClientServer,
  readAdminMcpClientServers,
  deleteAdminMcpClientServer,
  describeAiClientSettingsUpdate,
  parseConnectionPatch,
  replaceAdminMcpClientServer,
  updateAdminAiClientSettings,
} from "../server/llmproxy-admin";

test("parseConnectionPatch keeps supported patch fields", () => {
  assert.deepEqual(
    parseConnectionPatch({
      enabled: false,
      maxConcurrency: 3,
      ignored: "value",
    }),
    {
      enabled: false,
      maxConcurrency: 3,
    },
  );
});

test("parseConnectionPatch rejects invalid values", () => {
  assert.throws(() => parseConnectionPatch({ enabled: "yes" }), /"enabled" must be a boolean/);
  assert.throws(() => parseConnectionPatch({ maxConcurrency: 0 }), /"maxConcurrency" must be a positive integer/);
});

test("describeAiClientSettingsUpdate applies all server config fields immediately", () => {
  const update = describeAiClientSettingsUpdate(
    {
      requestTimeoutMs: 600_000,
      queueTimeoutMs: 30_000,
      healthCheckIntervalMs: 10_000,
      recentRequestLimit: 1000,
    },
    {
      requestTimeoutMs: 120_000,
      queueTimeoutMs: 30_000,
      healthCheckIntervalMs: 10_000,
      recentRequestLimit: 1000,
      connections: [],
    },
  );

  assert.deepEqual(update.appliedImmediatelyFields, ["requestTimeoutMs"]);
  assert.deepEqual(update.persistedAiClientSettings, {
    requestTimeoutMs: 120_000,
    queueTimeoutMs: 30_000,
    healthCheckIntervalMs: 10_000,
    recentRequestLimit: 1000,
  });
});

test("updateAdminAiClientSettings applies the server config to the load balancer", async () => {
  const appliedConfigs: unknown[] = [];

  const update = await updateAdminAiClientSettings(
    {
      configService: {
        updateAiClientSettings: async () => ({
          requestTimeoutMs: 120_000,
          queueTimeoutMs: 30_000,
          healthCheckIntervalMs: 10_000,
          recentRequestLimit: 1000,
          connections: [],
        }),
      } as never,
      loadBalancer: {
        getAiClientSettings: () => ({
          requestTimeoutMs: 600_000,
          queueTimeoutMs: 30_000,
          healthCheckIntervalMs: 10_000,
          recentRequestLimit: 1000,
        }),
        replaceConfig: (config: unknown) => {
          appliedConfigs.push(config);
        },
      },
    },
    {
      requestTimeoutMs: 120_000,
      queueTimeoutMs: 30_000,
      healthCheckIntervalMs: 10_000,
      recentRequestLimit: 1000,
    },
  );

  assert.deepEqual(appliedConfigs, [{
    requestTimeoutMs: 120_000,
    queueTimeoutMs: 30_000,
    healthCheckIntervalMs: 10_000,
    recentRequestLimit: 1000,
    connections: [],
  }]);
  assert.deepEqual(update.appliedImmediatelyFields, ["requestTimeoutMs"]);
});

test("admin operations create, replace, and delete external MCP servers through the persisted config", async () => {
  const created = await createAdminMcpClientServer(
    {
      configService: {
        createServer: async () => ({
          id: "remote-docs",
          title: "Remote Docs",
          endpoint: "https://example.com/mcp",
          transport: "streamable-http",
        }),
        listEditableServers: async () => [],
        replaceServer: async () => ({
          id: "unused",
          title: "unused",
          endpoint: "https://example.com/unused",
          transport: "streamable-http",
        }),
        deleteServer: async () => undefined,
      },
    },
    {
      id: "remote-docs",
      title: "Remote Docs",
      endpoint: "https://example.com/mcp",
    },
  );

  assert.equal(created.id, "remote-docs");

  const listed = await readAdminMcpClientServers({
    configService: {
      listEditableServers: async () => [
        {
          id: "remote-docs",
          title: "Remote Docs",
          endpoint: "https://example.com/mcp",
          transport: "streamable-http",
        },
      ],
      createServer: async () => ({
        id: "unused",
        title: "unused",
        endpoint: "https://example.com/unused",
        transport: "streamable-http",
      }),
      replaceServer: async () => ({
        id: "unused",
        title: "unused",
        endpoint: "https://example.com/unused",
        transport: "streamable-http",
      }),
      deleteServer: async () => undefined,
    },
  });

  assert.equal(listed.length, 1);

  const replaced = await replaceAdminMcpClientServer(
    {
      configService: {
        createServer: async () => ({
          id: "unused",
          title: "unused",
          endpoint: "https://example.com/unused",
          transport: "streamable-http",
        }),
        listEditableServers: async () => [],
        replaceServer: async () => ({
          id: "remote-docs-v2",
          title: "Remote Docs v2",
          endpoint: "https://example.com/v2/mcp",
          transport: "streamable-http",
        }),
        deleteServer: async () => undefined,
      },
    },
    "remote-docs",
    {
      id: "remote-docs-v2",
      title: "Remote Docs v2",
      endpoint: "https://example.com/v2/mcp",
    },
  );

  assert.equal(replaced.id, "remote-docs-v2");

  await deleteAdminMcpClientServer(
    {
      configService: {
        createServer: async () => ({
          id: "unused",
          title: "unused",
          endpoint: "https://example.com/unused",
          transport: "streamable-http",
        }),
        listEditableServers: async () => [],
        replaceServer: async () => ({
          id: "unused",
          title: "unused",
          endpoint: "https://example.com/unused",
          transport: "streamable-http",
        }),
        deleteServer: async () => undefined,
      },
    },
    "remote-docs-v2",
  );
});
