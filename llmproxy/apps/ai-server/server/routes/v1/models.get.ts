import { defineEventHandler } from "h3";
import { applyAiServerPublicCors } from "../../ai-server-public-cors";

export default defineEventHandler((event) => {
  applyAiServerPublicCors(event);
  return event.context.aiProxy.buildModelsPayload();
});
