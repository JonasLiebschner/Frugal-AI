import { defineEventHandler } from "h3";
import { cloneToolRegistryServiceDefinition } from "../../../../tool-registry-types";

export default defineEventHandler((event) => {
  const services = event.context.toolRegistry.getServices();

  return {
    services: services.map((service) => cloneToolRegistryServiceDefinition(service.definition)),
  };
});
