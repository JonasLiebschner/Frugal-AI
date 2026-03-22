import { setupAiRequestMiddlewareNitroPlugin } from "../ai-request-middleware-nitro";

export default defineNitroPlugin((nitroApp) => {
  setupAiRequestMiddlewareNitroPlugin(nitroApp);
});
