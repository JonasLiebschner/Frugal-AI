export interface ExternalMcpServerDefinition {
  id: string;
  title: string;
  endpoint: string;
  description?: string;
  transport?: "streamable-http";
  protocolVersion?: string;
  headers?: Record<string, string>;
}

export type ExternalMcpServerProvider = () =>
  | ExternalMcpServerDefinition
  | ExternalMcpServerDefinition[]
  | undefined;

export interface McpClientRegistrar {
  registerServer: (
    provider: ExternalMcpServerProvider | ExternalMcpServerProvider[],
  ) => ExternalMcpServerProvider[];
}

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

export interface McpPromptCompletionRequest {
  argumentName: string;
  value: string;
  contextArguments: Record<string, string>;
}

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

export interface ExternalMcpServerManifest {
  server: ExternalMcpServerDefinition;
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo?: Record<string, unknown>;
  instructions?: string;
  tools: McpToolDefinition[];
  prompts: McpPromptDefinition[];
  resources: McpResourceDefinition[];
  resourceTemplates: McpResourceTemplateDefinition[];
}

export interface McpClientService {
  registerServer: McpClientRegistrar["registerServer"];
  replaceRuntimeConfigServers: (servers: readonly ExternalMcpServerDefinition[]) => void;
  replacePersistedServers: (servers: readonly ExternalMcpServerDefinition[]) => void;
  listServers: () => ExternalMcpServerDefinition[];
  getServer: (serverId: string) => ExternalMcpServerDefinition | undefined;
  getManifest: (serverId: string) => Promise<ExternalMcpServerManifest>;
  callTool: (
    serverId: string,
    toolName: string,
    args: unknown,
  ) => Promise<McpToolCallResult>;
  getPrompt: (
    serverId: string,
    promptName: string,
    args: Record<string, string>,
  ) => Promise<McpPromptPayload>;
  completePrompt: (
    serverId: string,
    promptName: string,
    request: McpPromptCompletionRequest,
  ) => Promise<McpCompletionResult>;
  readResource: (
    serverId: string,
    uri: string,
  ) => Promise<{ contents: unknown[] }>;
}

export interface McpClientServiceOptions {
  fetch?: typeof fetch;
}
