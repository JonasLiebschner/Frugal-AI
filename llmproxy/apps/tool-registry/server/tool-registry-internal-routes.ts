export const toolRegistryInternalServicesPath = "/api/tool-registry/internal/services";
export const toolRegistryInternalToolRoutePattern = `${toolRegistryInternalServicesPath}/:serviceId/tools/:toolName`;

export function buildToolRegistryInternalToolPath(serviceId: string, toolName: string): string {
  return `${toolRegistryInternalServicesPath}/${encodeURIComponent(serviceId)}/tools/${encodeURIComponent(toolName)}`;
}
