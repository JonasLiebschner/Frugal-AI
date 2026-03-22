import configSchema from "../../config.schema.json";
import { createAppConfigSchemaRegistrar } from "../json-schema-capability";

export default defineNitroPlugin(
  createAppConfigSchemaRegistrar("json-schema", configSchema),
);
