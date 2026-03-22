import configSchema from "../../config.schema.json";
import {
  createAppConfigSchemaRegistrar,
  createRegisteredAppConfigSchemaSource,
} from "../../../json-schema/server/json-schema-capability";
import { setEventContextValue } from "../../../shared/server/event-context";
import { createConfigService } from "../config-runtime";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.$config = createConfigService(
    undefined,
    createRegisteredAppConfigSchemaSource(nitroApp),
  );
  createAppConfigSchemaRegistrar("config", configSchema)(nitroApp);

  nitroApp.hooks.hook("request", (event) => {
    setEventContextValue(event, "config", nitroApp.$config);
  });
});
