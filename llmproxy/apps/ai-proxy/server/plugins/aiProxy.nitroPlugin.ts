import { setupAiProxyNitroPlugin } from "../ai-proxy-nitro";

export default defineNitroPlugin((nitroApp) => {
  setupAiProxyNitroPlugin(nitroApp);
});
