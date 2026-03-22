import { defineEventHandler, getRouterParam } from "h3";

export default defineEventHandler((event) => {
  const packageName = getRouterParam(event, "id");
  if (!packageName) {
    throw new Error("invalid id");
  }

  return event.context.config.readPublicConfig(packageName);
});
