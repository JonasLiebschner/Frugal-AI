import configSchema from "../../config.schema.json";
import { createAppConfigSchemaRegistrar } from "../../../json-schema/server/json-schema-capability";
import { createPluginsService } from "../plugins-capability";

export default defineNitroPlugin((nitroApp) => {
  const plugins = createPluginsService("plugins");

  nitroApp.$plugins = plugins;
  createAppConfigSchemaRegistrar("plugins", configSchema)(nitroApp);
});
