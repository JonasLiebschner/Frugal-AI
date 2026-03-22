import { setupAiClientNitroPlugin } from "../ai-client-nitro";

export default defineNitroPlugin((nitroApp) => {
  setupAiClientNitroPlugin(nitroApp);
});
