import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import type { AiClientConfig } from "../../shared/type-api";
import {
  createLlmproxyTestRuntimeDependencies,
  type LlmproxyTestLoadBalancer,
  NitroTestServer,
} from "./runtime-api";
import { delay } from "./test-helpers";

type NitroTestServerOptions = ConstructorParameters<typeof NitroTestServer>[1];

export interface StartedTestRouter {
  loadBalancer: LlmproxyTestLoadBalancer;
  server: NitroTestServer;
}

interface TestServerListenOptions {
  host?: string;
  port?: number;
}

export interface RecentRequestSummary {
  id: string;
  path: string;
  outcome: string;
}

export interface ActiveConnectionSummary {
  id: string;
  hasDetail?: boolean;
  path: string;
  effectiveCompletionTokenLimit?: number;
}

export interface BackendHealthSummary {
  id: string;
  healthy: boolean;
  discoveredModels: string[];
}

export async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const probe = createNetServer();

    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();

      if (!address || typeof address === "string") {
        probe.close(() => {
          reject(new Error("Could not determine a free port."));
        });
        return;
      }

      const { port } = address;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

export async function startRouter(
  config: AiClientConfig,
  configPath: string,
  serverOptions?: NitroTestServerOptions & TestServerListenOptions,
): Promise<StartedTestRouter> {
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  const dependencies = await createLlmproxyTestRuntimeDependencies(configPath);

  const server = new NitroTestServer(dependencies, serverOptions);
  await server.start();

  return { loadBalancer: dependencies.loadBalancer, server };
}

async function readAdminState<T>(baseUrl: string): Promise<T> {
  const response = await fetch(`${baseUrl}/api/llmproxy/admin/state`);
  assert.equal(response.status, 200);
  return await response.json() as T;
}

export async function waitForOuterState(
  baseUrl: string,
  expectedModel = "mock-stack-model",
): Promise<{
  backends: BackendHealthSummary[];
}> {
  let lastPayload: { backends: BackendHealthSummary[] } | undefined;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const payload = await readAdminState<{ backends: BackendHealthSummary[] }>(baseUrl);
    lastPayload = payload;

    if (payload.backends[0]?.discoveredModels.includes(expectedModel)) {
      return payload;
    }

    await delay(50);
  }

  throw new Error(`Timed out waiting for discovered models. Last state: ${JSON.stringify(lastPayload)}`);
}

export async function waitForHealthyBackend(
  baseUrl: string,
  backendId: string,
): Promise<void> {
  let lastPayload: { backends: Array<Pick<BackendHealthSummary, "id" | "healthy">> } | undefined;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const payload = await readAdminState<{
      backends: Array<Pick<BackendHealthSummary, "id" | "healthy">>;
    }>(baseUrl);
    lastPayload = payload;

    if (payload.backends.some((backend) => backend.id === backendId && backend.healthy)) {
      return;
    }

    await delay(50);
  }

  throw new Error(`Timed out waiting for backend health. Last state: ${JSON.stringify(lastPayload)}`);
}

export async function waitForActiveConnection(
  baseUrl: string,
): Promise<ActiveConnectionSummary> {
  let lastPayload: { activeConnections: ActiveConnectionSummary[] } | undefined;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const payload = await readAdminState<{ activeConnections: ActiveConnectionSummary[] }>(baseUrl);
    lastPayload = payload;

    if (payload.activeConnections.length > 0) {
      return payload.activeConnections[0];
    }

    await delay(25);
  }

  throw new Error(`Timed out waiting for an active connection. Last state: ${JSON.stringify(lastPayload)}`);
}

export async function waitForRecentRequest(
  baseUrl: string,
  predicate: (entry: RecentRequestSummary) => boolean,
): Promise<RecentRequestSummary> {
  let lastPayload: { recentRequests: RecentRequestSummary[] } | undefined;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const payload = await readAdminState<{ recentRequests: RecentRequestSummary[] }>(baseUrl);
    lastPayload = payload;

    const match = payload.recentRequests.find(predicate);
    if (match) {
      return match;
    }

    await delay(50);
  }

  throw new Error(`Timed out waiting for a retained request entry. Last state: ${JSON.stringify(lastPayload)}`);
}
