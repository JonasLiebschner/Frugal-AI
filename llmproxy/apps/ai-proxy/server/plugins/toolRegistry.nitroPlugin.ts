import { aiProxyToolRegistryToolProviders } from "../ai-proxy-capability";

export default defineNitroPlugin((nitroApp) => {
  let registered = false;

  nitroApp.hooks.hook("request", () => {
    if (registered || !nitroApp.$toolRegistry) {
      return;
    }

    nitroApp.$toolRegistry.registerTool(aiProxyToolRegistryToolProviders);
    registered = true;
  });
});
