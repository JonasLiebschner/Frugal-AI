import { defineEventHandler, readBody } from "h3";

import { requireRouteParam } from "../../../../../../../utils/internal-route-utils";

export default defineEventHandler(async (event) => {
  const serverId = requireRouteParam(event, "serverId");
  const toolName = requireRouteParam(event, "toolName");

  const body = await readBody(event);
  return await event.context.mcpClient.callTool(serverId, toolName, body ?? {});
});
