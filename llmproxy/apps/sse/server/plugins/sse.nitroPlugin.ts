import { createSseService } from "../sse-capability";
import { closeNitroLifecycle } from "../../../shared/server/nitro-lifecycle-hooks";

export default defineNitroPlugin((nitroApp) => {
  const plugin = createSseService();

  nitroApp.$sse = plugin;
  closeNitroLifecycle(nitroApp, async () => {
    await plugin.closeAll();
  });
});
