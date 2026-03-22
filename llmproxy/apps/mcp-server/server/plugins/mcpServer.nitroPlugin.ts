import type { RequestFetch } from "../../../shared/server/request-fetch";
import { assignEventContext } from "../../../shared/server/event-context";
import {
  createMcpServerEventCapability,
  createMcpServerNitroCapability,
  createMcpServiceRegistry,
  createMcpHttpTransport,
} from "../mcp-server-capability";

export default defineNitroPlugin((nitroApp) => {
  const runtimeConfig = useRuntimeConfig();
  const isEnabled = () => runtimeConfig.private.mcpEnabled !== false;
  const plugin = createMcpServiceRegistry({
    isEnabled,
  });
  const transport = createMcpHttpTransport({
    isEnabled,
    sessionTtlMs: () => runtimeConfig.private.mcpSessionTtlMs ?? 3600000,
    allowedOrigins: () => runtimeConfig.private.mcpAllowedOrigins ?? [],
  });

  nitroApp.$mcpServer = createMcpServerNitroCapability(plugin, transport);
  nitroApp.hooks.hook("request", (event) => {
    assignEventContext(event, {
      mcpServer: createMcpServerEventCapability(
        plugin,
        transport,
        event.$fetch as RequestFetch,
      ),
    });
  });
});
