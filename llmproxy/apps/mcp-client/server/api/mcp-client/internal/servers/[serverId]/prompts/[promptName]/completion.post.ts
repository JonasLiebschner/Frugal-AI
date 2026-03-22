import { defineEventHandler, readBody } from "h3";

import {
  normalizePromptCompletionRequest,
  requireRouteParam,
} from "../../../../../../../utils/internal-route-utils";

export default defineEventHandler(async (event) => {
  const serverId = requireRouteParam(event, "serverId");
  const promptName = requireRouteParam(event, "promptName");

  const body = await readBody(event);
  return await event.context.mcpClient.completePrompt(
    serverId,
    promptName,
    normalizePromptCompletionRequest(body),
  );
});
