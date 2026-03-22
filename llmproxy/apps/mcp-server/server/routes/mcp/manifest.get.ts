import { defineEventHandler, setResponseStatus } from "h3";
import { MCP_DISABLED_MESSAGE } from "../../mcp-protocol";
import { mcpError } from "../../utils/error-response";

export default defineEventHandler(async (event) => {
  if (!event.context.mcpServer.isEnabled()) {
    setResponseStatus(event, 503);
    return mcpError(MCP_DISABLED_MESSAGE, "mcp_disabled");
  }

  return await event.context.mcpServer.getManifest();
});
