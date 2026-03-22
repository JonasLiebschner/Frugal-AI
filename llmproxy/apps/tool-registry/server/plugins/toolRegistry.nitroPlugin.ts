import {
  createToolRegistryServiceRegistry,
  type ToolRegistryServiceRegistry,
} from "../tool-registry-capability";
import { attachRequestFetchNitroContext, type RequestFetch } from "../../../shared/server/request-fetch";

export default defineNitroPlugin((nitroApp) => {
  const plugin = createToolRegistryServiceRegistry<RequestFetch>();

  nitroApp.$toolRegistry = plugin;
  attachRequestFetchNitroContext(nitroApp, "toolRegistry", plugin);
});
