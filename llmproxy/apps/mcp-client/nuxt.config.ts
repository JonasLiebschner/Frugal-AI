import type { ExternalMcpServerDefinition } from "./server/mcp-client-types";

export default defineNuxtConfig({
  compatibilityDate: "2024-09-06",
  runtimeConfig: {
    private: {
      mcpClientServers: [] as ExternalMcpServerDefinition[],
    },
  },
});
