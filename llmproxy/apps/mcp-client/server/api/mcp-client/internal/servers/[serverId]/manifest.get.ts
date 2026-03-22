import { defineEventHandler } from "h3";

import { requireRouteParam } from "../../../../../utils/internal-route-utils";

export default defineEventHandler(async (event) => {
  const serverId = requireRouteParam(event, "serverId");

  return await event.context.mcpClient.getManifest(serverId);
});
