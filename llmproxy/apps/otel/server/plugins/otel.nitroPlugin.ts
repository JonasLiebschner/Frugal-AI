import { setupOtelNitroPlugin } from "../otel-nitro";

export default defineNitroPlugin((nitroApp) => {
  setupOtelNitroPlugin(nitroApp);
});
