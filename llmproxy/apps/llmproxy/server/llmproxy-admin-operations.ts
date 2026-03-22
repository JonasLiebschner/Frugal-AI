import type { ConnectionPatch } from "../../shared/type-api";
import { findChangedServerFields } from "./llmproxy-admin-payloads";
import type {
  ConnectionEditorConfig,
  ConnectionSavePayload,
  ExternalMcpServerEditorConfig,
  McpClientServerSavePayload,
  AiClientConfig,
  AiClientEditorConfig,
  AiClientSettings,
} from "../../shared/type-api";
import type {
  AiRequestRoutingMiddlewareEditorConfig,
  AiRequestRoutingMiddlewareSavePayload,
} from "../../ai-request-middleware/server/ai-request-middleware-capability";
import { isPositiveInteger } from "../../shared/server/core-utils";

export interface AdminConfigService {
  loadEditableConfig(): Promise<AiClientEditorConfig>;
  updateAiClientSettings(settings: AiClientSettings): Promise<AiClientConfig>;
  updateConnection(id: string, patch: ConnectionPatch): Promise<AiClientConfig>;
  createConnection(payload: ConnectionSavePayload): Promise<{ config: AiClientConfig; connection: ConnectionEditorConfig }>;
  replaceConnection(currentId: string, payload: ConnectionSavePayload): Promise<{ config: AiClientConfig; connection: ConnectionEditorConfig }>;
  deleteConnection(id: string): Promise<AiClientConfig>;
}

export interface AdminMcpClientConfigService {
  listEditableServers(): Promise<ExternalMcpServerEditorConfig[]>;
  createServer(payload: McpClientServerSavePayload): Promise<ExternalMcpServerEditorConfig>;
  replaceServer(currentId: string, payload: McpClientServerSavePayload): Promise<ExternalMcpServerEditorConfig>;
  deleteServer(id: string): Promise<void>;
}

export interface AdminAiRequestMiddlewareConfigService {
  listEditableMiddlewares(): Promise<AiRequestRoutingMiddlewareEditorConfig[]>;
  createMiddleware(
    payload: AiRequestRoutingMiddlewareSavePayload,
  ): Promise<AiRequestRoutingMiddlewareEditorConfig>;
  replaceMiddleware(
    currentId: string,
    payload: AiRequestRoutingMiddlewareSavePayload,
  ): Promise<AiRequestRoutingMiddlewareEditorConfig>;
  deleteMiddleware(id: string): Promise<void>;
}

export interface AdminLoadBalancer {
  getAiClientSettings(): AiClientSettings;
  replaceConfig(config: AiClientConfig): void;
}

export interface AdminOperationsContext {
  configService: AdminConfigService;
  loadBalancer: AdminLoadBalancer;
}

export interface AdminMcpClientOperationsContext {
  configService: AdminMcpClientConfigService;
}

export interface AdminAiRequestMiddlewareOperationsContext {
  configService: AdminAiRequestMiddlewareConfigService;
}

export interface AiClientSettingsUpdateEffect {
  persistedAiClientSettings: AiClientSettings;
  appliedImmediatelyFields: Array<keyof AiClientSettings>;
}

export function parseConnectionPatch(input: Record<string, unknown>): ConnectionPatch {
  const patch: ConnectionPatch = {};

  if ("enabled" in input) {
    if (typeof input.enabled !== "boolean") {
      throw new Error('"enabled" must be a boolean.');
    }

    patch.enabled = input.enabled;
  }

  if ("maxConcurrency" in input) {
    if (!isPositiveInteger(input.maxConcurrency)) {
      throw new Error('"maxConcurrency" must be a positive integer.');
    }

    patch.maxConcurrency = input.maxConcurrency;
  }

  return patch;
}

export function describeAiClientSettingsUpdate(
  currentRuntimeSettings: AiClientSettings,
  nextConfig: AiClientConfig,
): AiClientSettingsUpdateEffect {
  const nextSettings = extractAiClientSettings(nextConfig);
  const changedFields = findChangedServerFields(currentRuntimeSettings, nextSettings);

  return {
    persistedAiClientSettings: nextSettings,
    appliedImmediatelyFields: changedFields,
  };
}

export async function readAdminConnectionState(
  context: AdminOperationsContext,
): Promise<{
  settings: AiClientSettings;
  data: ConnectionEditorConfig[];
}> {
  const config = await context.configService.loadEditableConfig();
  return {
    settings: extractAiClientSettings(config),
    data: config.connections,
  };
}

export async function readAdminMcpClientServers(
  context: AdminMcpClientOperationsContext,
): Promise<ExternalMcpServerEditorConfig[]> {
  return await context.configService.listEditableServers();
}

export async function readAdminAiRequestMiddlewares(
  context: AdminAiRequestMiddlewareOperationsContext,
): Promise<AiRequestRoutingMiddlewareEditorConfig[]> {
  return await context.configService.listEditableMiddlewares();
}

export async function updateAdminAiClientSettings(
  context: AdminOperationsContext,
  payload: AiClientSettings,
): Promise<AiClientSettingsUpdateEffect> {
  const nextConfig = await context.configService.updateAiClientSettings(payload);
  const update = describeAiClientSettingsUpdate(context.loadBalancer.getAiClientSettings(), nextConfig);
  context.loadBalancer.replaceConfig(nextConfig);
  return update;
}

export async function patchAdminConnection(
  context: AdminOperationsContext,
  connectionId: string,
  patch: ConnectionPatch,
): Promise<void> {
  const nextConfig = await context.configService.updateConnection(connectionId, patch);
  context.loadBalancer.replaceConfig(nextConfig);
}

export async function createAdminConnection(
  context: AdminOperationsContext,
  payload: ConnectionSavePayload,
): Promise<ConnectionEditorConfig> {
  const result = await context.configService.createConnection(payload);
  context.loadBalancer.replaceConfig(result.config);
  return result.connection;
}

export async function replaceAdminConnection(
  context: AdminOperationsContext,
  currentId: string,
  payload: ConnectionSavePayload,
): Promise<ConnectionEditorConfig> {
  const result = await context.configService.replaceConnection(currentId, payload);
  context.loadBalancer.replaceConfig(result.config);
  return result.connection;
}

export async function deleteAdminConnection(
  context: AdminOperationsContext,
  connectionId: string,
): Promise<void> {
  const nextConfig = await context.configService.deleteConnection(connectionId);
  context.loadBalancer.replaceConfig(nextConfig);
}

export async function createAdminMcpClientServer(
  context: AdminMcpClientOperationsContext,
  payload: McpClientServerSavePayload,
): Promise<ExternalMcpServerEditorConfig> {
  return await context.configService.createServer(payload);
}

export async function replaceAdminMcpClientServer(
  context: AdminMcpClientOperationsContext,
  currentId: string,
  payload: McpClientServerSavePayload,
): Promise<ExternalMcpServerEditorConfig> {
  return await context.configService.replaceServer(currentId, payload);
}

export async function deleteAdminMcpClientServer(
  context: AdminMcpClientOperationsContext,
  serverId: string,
): Promise<void> {
  await context.configService.deleteServer(serverId);
}

export async function createAdminAiRequestMiddleware(
  context: AdminAiRequestMiddlewareOperationsContext,
  payload: AiRequestRoutingMiddlewareSavePayload,
): Promise<AiRequestRoutingMiddlewareEditorConfig> {
  return await context.configService.createMiddleware(payload);
}

export async function replaceAdminAiRequestMiddleware(
  context: AdminAiRequestMiddlewareOperationsContext,
  currentId: string,
  payload: AiRequestRoutingMiddlewareSavePayload,
): Promise<AiRequestRoutingMiddlewareEditorConfig> {
  return await context.configService.replaceMiddleware(currentId, payload);
}

export async function deleteAdminAiRequestMiddleware(
  context: AdminAiRequestMiddlewareOperationsContext,
  middlewareId: string,
): Promise<void> {
  await context.configService.deleteMiddleware(middlewareId);
}

function extractAiClientSettings(config: AiClientSettings): AiClientSettings;
function extractAiClientSettings(config: AiClientConfig | AiClientEditorConfig): AiClientSettings;
function extractAiClientSettings(config: AiClientSettings | AiClientConfig | AiClientEditorConfig): AiClientSettings {
  return {
    requestTimeoutMs: config.requestTimeoutMs,
    queueTimeoutMs: config.queueTimeoutMs,
    healthCheckIntervalMs: config.healthCheckIntervalMs,
    recentRequestLimit: config.recentRequestLimit,
  };
}
