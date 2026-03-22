import configSchema from "../../config.schema.json";
import { createAppConfigSchemaRegistrar } from "../../../json-schema/server/json-schema-capability";

export default defineNitroPlugin(
  createAppConfigSchemaRegistrar("ajv", configSchema),
);
