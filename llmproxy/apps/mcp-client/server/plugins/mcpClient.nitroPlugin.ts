import { setupMcpClientNitroPlugin } from "../mcp-client-nitro";

export default defineNitroPlugin((nitroApp) => {
  setupMcpClientNitroPlugin(nitroApp);
});
