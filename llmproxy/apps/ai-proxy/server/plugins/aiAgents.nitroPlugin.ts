import { aiProxyPromptProviders } from "../ai-proxy-capability";

export default defineNitroPlugin((nitroApp) => {
  let registered = false;

  nitroApp.hooks.hook("request", () => {
    if (registered || !nitroApp.$aiAgents) {
      return;
    }

    nitroApp.$aiAgents.registerPrompt(aiProxyPromptProviders);
    registered = true;
  });
});
