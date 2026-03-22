import { defineEventHandler } from "h3";
import { applyAiServerPublicCors } from "../../../ai-server-public-cors";

export default defineEventHandler(async (event) => {
  applyAiServerPublicCors(event);
  return await event.context.aiProxy.handlePublicRoute(event);
});
