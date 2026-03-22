import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createConfigTestService } from "../../config/test/runtime-api";
import type { McpClientServerSavePayload } from "../../shared/type-api";
import {
  createMcpClientConfigService,
  type PersistedMcpClientConfig,
} from "../server/mcp-client-capability";

const TEST_CONFIG: PersistedMcpClientConfig = {
  servers: [
    {
      id: "remote-docs",
      title: "Remote Docs",
      endpoint: "https://example.com/mcp",
      description: "Remote documentation MCP",
      transport: "streamable-http",
      protocolVersion: "2025-11-25",
      headers: {
        authorization: "Bearer test-token",
      },
    },
  ],
};

async function withMcpClientConfigService(
  run: (
    service: ReturnType<typeof createMcpClientConfigService>,
    configPath: string,
    syncLog: PersistedMcpClientConfig["servers"][],
  ) => Promise<void>,
): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-client-config-"));
  const configPath = path.join(tempDir, "mcp-client.config.json");
  const syncLog: PersistedMcpClientConfig["servers"][] = [];

  await writeFile(configPath, `${JSON.stringify(TEST_CONFIG, null, 2)}\n`, "utf8");

  try {
    const config = createConfigTestService({
      configFilePaths: {
        "mcp-client": configPath,
      },
    });
    const service = createMcpClientConfigService({
      config,
      mcpClient: {
        replacePersistedServers: (servers) => {
          syncLog.push(structuredClone([...servers]));
        },
      },
    });
    await run(service, configPath, syncLog);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("lists editable external MCP servers", async () => {
  await withMcpClientConfigService(async (service) => {
    const servers = await service.listEditableServers();

    assert.deepEqual(servers, [
      {
        id: "remote-docs",
        title: "Remote Docs",
        endpoint: "https://example.com/mcp",
        description: "Remote documentation MCP",
        transport: "streamable-http",
        protocolVersion: "2025-11-25",
        headers: {
          authorization: "Bearer test-token",
        },
      },
    ]);
  });
});

test("creates, replaces, and deletes external MCP servers in the mcp-client config", async () => {
  await withMcpClientConfigService(async (service, configPath, syncLog) => {
    const createdPayload: McpClientServerSavePayload = {
      id: "support-remote",
      title: "Support Remote",
      endpoint: "https://support.example.com/mcp",
      description: "Support workflows",
      protocolVersion: "2025-11-25",
      headers: {
        authorization: "Bearer support-token",
      },
    };

    const created = await service.createServer(createdPayload);
    assert.equal(created.id, "support-remote");

    let persisted = JSON.parse(await readFile(configPath, "utf8")) as PersistedMcpClientConfig;
    let remote = persisted.servers.find((entry) => entry.id === "support-remote");
    assert.deepEqual(remote, {
      id: "support-remote",
      title: "Support Remote",
      endpoint: "https://support.example.com/mcp",
      description: "Support workflows",
      transport: "streamable-http",
      protocolVersion: "2025-11-25",
      headers: {
        authorization: "Bearer support-token",
      },
    });

    const replaced = await service.replaceServer("support-remote", {
      id: "support-remote-renamed",
      title: "Support Remote Renamed",
      endpoint: "https://support.example.com/v2/mcp",
      description: "Support workflows v2",
      headers: {
        authorization: "Bearer replacement-token",
      },
    });

    assert.equal(replaced.id, "support-remote-renamed");

    persisted = JSON.parse(await readFile(configPath, "utf8")) as PersistedMcpClientConfig;
    remote = persisted.servers.find((entry) => entry.id === "support-remote-renamed");
    assert.deepEqual(remote, {
      id: "support-remote-renamed",
      title: "Support Remote Renamed",
      endpoint: "https://support.example.com/v2/mcp",
      description: "Support workflows v2",
      transport: "streamable-http",
      headers: {
        authorization: "Bearer replacement-token",
      },
    });

    await service.deleteServer("support-remote-renamed");

    persisted = JSON.parse(await readFile(configPath, "utf8")) as PersistedMcpClientConfig;
    assert.equal(persisted.servers.find((entry) => entry.id === "support-remote-renamed"), undefined);

    assert.equal(syncLog.length, 3);
    assert.equal(syncLog[0]?.length, 2);
    assert.equal(syncLog[1]?.some((entry) => entry.id === "support-remote-renamed"), true);
    assert.equal(syncLog[2]?.length, 1);
  });
});

test("creates a default mcp-client config file when none exists", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-client-config-missing-"));
  const configPath = path.join(tempDir, ".data", "config", "mcp-client", "config.json");

  try {
    const config = createConfigTestService({
      configFilePaths: {
        "mcp-client": configPath,
      },
    });
    const service = createMcpClientConfigService({ config });
    const next = await service.load();

    assert.deepEqual(next, { servers: [] });

    const persisted = JSON.parse(await readFile(configPath, "utf8")) as PersistedMcpClientConfig;
    assert.deepEqual(persisted, next);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
