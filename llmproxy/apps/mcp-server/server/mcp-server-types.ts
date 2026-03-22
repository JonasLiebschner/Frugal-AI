import { cloneHelperRoutes } from "../../shared/server/service-registry";
import type { RequestFetch } from "../../shared/server/request-fetch";
import type { ServiceHelperRouteDefinition } from "../../shared/server/service-registry";

export interface McpIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
}

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpToolExecution {
  taskSupport?: "forbidden" | "optional" | "required";
}

export interface McpToolDefinition {
  icons?: McpIcon[];
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  execution?: McpToolExecution;
  outputSchema?: Record<string, unknown>;
  annotations?: McpToolAnnotations;
}

export interface McpServiceMetadata {
  id: string;
  title: string;
  description: string;
  helperRoutes?: McpHelperRouteDefinition[];
}

export interface McpPromptArgumentDefinition {
  name: string;
  title?: string;
  description?: string;
  required?: boolean;
}

export interface McpPromptDefinition {
  icons?: McpIcon[];
  name: string;
  title?: string;
  description?: string;
  arguments?: McpPromptArgumentDefinition[];
}

export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface McpAudioContent {
  type: "audio";
  data: string;
  mimeType: string;
}

export interface McpResourceLink {
  type: "resource_link";
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface McpTextResourceContents {
  uri: string;
  mimeType?: string;
  text: string;
}

export interface McpBlobResourceContents {
  uri: string;
  mimeType?: string;
  blob: string;
}

export interface McpEmbeddedResource {
  type: "resource";
  resource: McpTextResourceContents | McpBlobResourceContents;
}

export type McpContentBlock =
  | McpTextContent
  | McpImageContent
  | McpAudioContent
  | McpResourceLink
  | McpEmbeddedResource;

export interface McpPromptMessage {
  role: "assistant" | "system" | "user";
  content: McpContentBlock;
}

export interface McpPromptPayload {
  description?: string;
  messages: McpPromptMessage[];
}

export type McpHelperRouteDefinition = ServiceHelperRouteDefinition;

export interface McpResourceDefinition {
  name: string;
  title?: string;
  uri: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

export interface McpResourceTemplateDefinition {
  name: string;
  title?: string;
  uriTemplate: string;
  description?: string;
  mimeType?: string;
}

export interface McpServiceDefinition {
  id: string;
  title: string;
  description: string;
  helperRoutes: McpHelperRouteDefinition[];
  tools: McpToolDefinition[];
  prompts: McpPromptDefinition[];
}

export interface McpManifest {
  endpoint: string;
  services: McpServiceDefinition[];
  helperRoutes: McpHelperRouteDefinition[];
  tools: McpToolDefinition[];
  prompts: McpPromptDefinition[];
  resources: McpResourceDefinition[];
  resourceTemplates: McpResourceTemplateDefinition[];
}

export interface McpToolCallResult {
  content: McpContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface McpCompletionList {
  values: string[];
  total?: number;
  hasMore?: boolean;
}

export interface McpCompletionResult {
  completion: McpCompletionList;
}

export type McpJsonRpcRequestId = string | number;

export interface McpJsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: McpJsonRpcRequestId;
  result: unknown;
}

export interface McpJsonRpcErrorResponse {
  jsonrpc: "2.0";
  id?: McpJsonRpcRequestId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type McpJsonRpcResponse = McpJsonRpcSuccessResponse | McpJsonRpcErrorResponse;

export interface McpPromptCompletionRequest {
  argumentName: string;
  value: string;
  contextArguments: Record<string, string>;
}

export interface McpToolRegistration<TContext = any> {
  service: McpServiceMetadata;
  definition: McpToolDefinition;
  call: (
    args: Record<string, unknown>,
    context: TContext,
  ) => McpToolCallResult | Promise<McpToolCallResult>;
}

export interface McpPromptRegistration<TContext = any> {
  service: McpServiceMetadata;
  definition: McpPromptDefinition;
  get: (
    args: Record<string, unknown>,
    context: TContext,
  ) => McpPromptPayload | Promise<McpPromptPayload>;
}

export interface McpService {
  definition: McpServiceDefinition;
  callTool?: (toolName: string, args: unknown) => McpToolCallResult | Promise<McpToolCallResult>;
  getPrompt?: (promptName: string, args: Record<string, string>) => McpPromptPayload | Promise<McpPromptPayload>;
  completePrompt?: (
    promptName: string,
    request: McpPromptCompletionRequest,
  ) => McpCompletionResult | Promise<McpCompletionResult>;
}

export interface McpRouteService<TManifest = unknown, TPayload = unknown, TResult = unknown> {
  getManifest: () => Promise<TManifest>;
  handleRequest: (payload: TPayload) => Promise<TResult>;
  isEnabled: () => boolean;
}

export interface McpHandlerRegistrar<THandler = unknown> {
  registerHandler: (
    handler: THandler | THandler[],
  ) => THandler[];
}

export type McpServiceHandler = () => McpService | McpService[] | undefined;

export interface McpServiceRegistryOptions {
  isEnabled?: () => boolean;
}

export interface McpServiceRegistry extends McpHandlerRegistrar<McpServiceHandler> {
  bindRequestFetch: (requestFetch: RequestFetch) => McpRouteService<McpManifest>;
  isEnabled: () => boolean;
}

export interface McpHttpSession {
  id: string;
  protocolVersion: string;
  initialized: boolean;
  createdAt: number;
  lastSeenAt: number;
  clientCapabilities?: Record<string, unknown>;
  clientInfo?: Record<string, unknown>;
}

export interface McpHttpTransport {
  isEnabled: () => boolean;
  supportsOrigin: (request: {
    originHeader: string | null;
    requestOrigin?: string | null;
  }) => boolean;
  initialize: (params: unknown) => {
    session: McpHttpSession;
    result: {
      protocolVersion: string;
      capabilities: Record<string, unknown>;
      serverInfo: Record<string, unknown>;
      instructions: string;
    };
  } | {
    response: McpJsonRpcResponse;
  };
  getSession: (sessionId: string | null | undefined) => McpHttpSession | undefined;
  resolveProtocolVersion: (
    session: McpHttpSession,
    headerValue: string | null,
  ) => {
    protocolVersion: string;
  } | {
    response: McpJsonRpcResponse;
  };
  markInitialized: (sessionId: string) => boolean;
  touchSession: (sessionId: string) => void;
  terminateSession: (sessionId: string | null | undefined) => boolean;
}

export interface McpHttpTransportOptions {
  isEnabled?: () => boolean;
  supportedVersions?: readonly string[];
  sessionTtlMs?: () => number;
  instructions?: () => string;
  allowedOrigins?: () => readonly string[];
}

export function cloneMcpToolDefinition(tool: McpToolDefinition): McpToolDefinition {
  return {
    ...tool,
    ...(tool.icons ? { icons: structuredClone(tool.icons) } : {}),
    inputSchema: structuredClone(tool.inputSchema),
    ...(tool.execution ? { execution: { ...tool.execution } } : {}),
    ...(tool.outputSchema ? { outputSchema: structuredClone(tool.outputSchema) } : {}),
    ...(tool.annotations ? { annotations: { ...tool.annotations } } : {}),
  };
}

export function cloneMcpPromptDefinition(prompt: McpPromptDefinition): McpPromptDefinition {
  return {
    ...prompt,
    ...(prompt.icons ? { icons: structuredClone(prompt.icons) } : {}),
    ...(prompt.arguments ? {
      arguments: prompt.arguments.map((argument) => ({ ...argument })),
    } : {}),
  };
}

export function cloneMcpResourceDefinition(resource: McpResourceDefinition): McpResourceDefinition {
  return {
    ...resource,
  };
}

export function cloneMcpResourceTemplateDefinition(
  template: McpResourceTemplateDefinition,
): McpResourceTemplateDefinition {
  return {
    ...template,
  };
}

export function cloneMcpServiceDefinition(service: McpServiceDefinition): McpServiceDefinition {
  return {
    id: service.id,
    title: service.title,
    description: service.description,
    helperRoutes: cloneHelperRoutes(service.helperRoutes),
    tools: service.tools.map(cloneMcpToolDefinition),
    prompts: service.prompts.map(cloneMcpPromptDefinition),
  };
}

export function cloneMcpManifest(manifest: McpManifest): McpManifest {
  return {
    endpoint: manifest.endpoint,
    services: manifest.services.map(cloneMcpServiceDefinition),
    helperRoutes: cloneHelperRoutes(manifest.helperRoutes),
    tools: manifest.tools.map(cloneMcpToolDefinition),
    prompts: manifest.prompts.map(cloneMcpPromptDefinition),
    resources: manifest.resources.map(cloneMcpResourceDefinition),
    resourceTemplates: manifest.resourceTemplates.map(cloneMcpResourceTemplateDefinition),
  };
}
