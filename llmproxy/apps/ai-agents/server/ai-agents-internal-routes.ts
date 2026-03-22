export const aiAgentsInternalServicesPath = "/api/ai-agents/internal/services";
export const aiAgentsInternalPromptRoutePattern = `${aiAgentsInternalServicesPath}/:serviceId/prompts/:promptName`;
export const aiAgentsInternalPromptCompletionRoutePattern = `${aiAgentsInternalPromptRoutePattern}/completion`;

export function buildAiAgentsInternalPromptPath(serviceId: string, promptName: string): string {
  return `${aiAgentsInternalServicesPath}/${encodeURIComponent(serviceId)}/prompts/${encodeURIComponent(promptName)}`;
}

export function buildAiAgentsInternalPromptCompletionPath(
  serviceId: string,
  promptName: string,
): string {
  return `${buildAiAgentsInternalPromptPath(serviceId, promptName)}/completion`;
}
