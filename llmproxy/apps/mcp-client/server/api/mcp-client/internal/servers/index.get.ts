import { defineEventHandler } from "h3";

export default defineEventHandler((event) => {
  return event.context.mcpClient.listServers();
});
