export const mcpClientInternalServersPath = "/api/mcp-client/internal/servers";
export const mcpClientInternalManifestRoutePattern = `${mcpClientInternalServersPath}/:serverId/manifest`;
export const mcpClientInternalToolRoutePattern = `${mcpClientInternalServersPath}/:serverId/tools/:toolName`;
export const mcpClientInternalPromptRoutePattern = `${mcpClientInternalServersPath}/:serverId/prompts/:promptName`;
export const mcpClientInternalPromptCompletionRoutePattern = `${mcpClientInternalPromptRoutePattern}/completion`;

export function buildMcpClientInternalManifestPath(serverId: string): string {
  return `${mcpClientInternalServersPath}/${encodeURIComponent(serverId)}/manifest`;
}

export function buildMcpClientInternalToolPath(serverId: string, toolName: string): string {
  return `${mcpClientInternalServersPath}/${encodeURIComponent(serverId)}/tools/${encodeURIComponent(toolName)}`;
}

export function buildMcpClientInternalPromptPath(serverId: string, promptName: string): string {
  return `${mcpClientInternalServersPath}/${encodeURIComponent(serverId)}/prompts/${encodeURIComponent(promptName)}`;
}

export function buildMcpClientInternalPromptCompletionPath(serverId: string, promptName: string): string {
  return `${buildMcpClientInternalPromptPath(serverId, promptName)}/completion`;
}
