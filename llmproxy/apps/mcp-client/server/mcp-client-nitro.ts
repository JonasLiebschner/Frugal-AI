import type { H3Event } from "h3";
import type { NitroApp } from "nitropack";

import {
  attachMcpClientEventContext,
  createMcpClientConfigService,
  createMcpClientNitroCapability,
  createMcpClientService,
  normalizeConfiguredMcpServers,
} from "./mcp-client-capability";

export function setupMcpClientNitroPlugin(
  nitroApp: NitroApp,
): void {
  const runtimeConfig = useRuntimeConfig();
  const service = createMcpClientService();
  const capabilityPromise = (async () => {
    const runtimeConfiguredServers = normalizeConfiguredMcpServers(
      runtimeConfig.private.mcpClientServers,
    );
    const configService = createMcpClientConfigService({
      config: nitroApp.$config,
      mcpClient: service,
    });
    const persistedConfig = await configService.load();

    service.replaceRuntimeConfigServers(runtimeConfiguredServers);
    service.replacePersistedServers(persistedConfig.servers);

    const capability = createMcpClientNitroCapability(service, configService);
    nitroApp.$mcpClient = capability;
    return capability;
  })();

  nitroApp.hooks.hook("request", async (event: H3Event) => {
    attachMcpClientEventContext(event, await capabilityPromise);
  });
}
