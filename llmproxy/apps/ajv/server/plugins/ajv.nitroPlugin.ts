import ajvFormats from "../ajv-formats";
import { createAjvServiceFromPlugins } from "../ajv-runtime";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.$plugins.createRegistry("ajv:keywords");
  nitroApp.$plugins.createRegistry("ajv:formats");
  nitroApp.$plugins.registerItem("ajv:formats", ajvFormats);

  const ajvService = createAjvServiceFromPlugins(nitroApp.$plugins);

  nitroApp.$ajv = ajvService;
});
