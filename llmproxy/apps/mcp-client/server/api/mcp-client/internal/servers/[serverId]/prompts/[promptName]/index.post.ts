import { defineEventHandler, readBody } from "h3";

import {
  asStringRecord,
  requireRouteParam,
} from "../../../../../../../utils/internal-route-utils";

export default defineEventHandler(async (event) => {
  const serverId = requireRouteParam(event, "serverId");
  const promptName = requireRouteParam(event, "promptName");

  const body = await readBody(event);
  return await event.context.mcpClient.getPrompt(serverId, promptName, asStringRecord(body));
});
