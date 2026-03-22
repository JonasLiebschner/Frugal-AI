export const LLMPROXY_ADMIN_BASE_PATH = "/api/llmproxy/admin";

export const llmproxyAdminStatePath = `${LLMPROXY_ADMIN_BASE_PATH}/state`;
export const llmproxyAdminConnectionsPath = `${LLMPROXY_ADMIN_BASE_PATH}/connections`;
export const llmproxyAdminServerConfigPath = `${LLMPROXY_ADMIN_BASE_PATH}/config/server`;
export const llmproxyAdminOtelPath = `${LLMPROXY_ADMIN_BASE_PATH}/otel`;
export const llmproxyAdminMcpClientServersPath = `${LLMPROXY_ADMIN_BASE_PATH}/mcp-client/servers`;
export const llmproxyAdminAiRequestMiddlewaresPath = `${LLMPROXY_ADMIN_BASE_PATH}/ai-request-middleware/middlewares`;

export function resolveLlmproxyAdminConnectionPath(connectionId: string): string {
  return `${llmproxyAdminConnectionsPath}/${encodeURIComponent(connectionId)}`;
}

export function resolveLlmproxyAdminMcpClientServerPath(serverId: string): string {
  return `${llmproxyAdminMcpClientServersPath}/${encodeURIComponent(serverId)}`;
}

export function resolveLlmproxyAdminAiRequestMiddlewarePath(middlewareId: string): string {
  return `${llmproxyAdminAiRequestMiddlewaresPath}/${encodeURIComponent(middlewareId)}`;
}

export function resolveLlmproxyAdminRequestPath(requestId: string): string {
  return `${LLMPROXY_ADMIN_BASE_PATH}/requests/${encodeURIComponent(requestId)}`;
}

export function resolveLlmproxyAdminRequestEventsPath(requestId: string): string {
  return `${resolveLlmproxyAdminRequestPath(requestId)}/events`;
}

export function resolveLlmproxyAdminRequestCancelPath(requestId: string): string {
  return `${resolveLlmproxyAdminRequestPath(requestId)}/cancel`;
}
