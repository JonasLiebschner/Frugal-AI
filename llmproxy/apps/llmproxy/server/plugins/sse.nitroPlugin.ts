import { registerLlmproxySseTopics } from "../llmproxy-sse";

export default defineNitroPlugin((nitroApp) => {
  if (nitroApp.$sse) {
    registerLlmproxySseTopics(nitroApp.$sse);
  }
});
