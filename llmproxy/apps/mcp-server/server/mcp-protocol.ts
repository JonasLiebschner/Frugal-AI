import type {
  McpCompletionResult,
  McpJsonRpcErrorResponse,
  McpJsonRpcRequestId,
  McpJsonRpcResponse,
  McpJsonRpcSuccessResponse,
  McpManifest,
  McpResourceDefinition,
  McpResourceTemplateDefinition,
  McpService,
  McpServiceDefinition,
} from "./mcp-server-types";
import {
  cloneMcpManifest,
  cloneMcpPromptDefinition,
  cloneMcpResourceDefinition,
  cloneMcpResourceTemplateDefinition,
  cloneMcpServiceDefinition,
  cloneMcpToolDefinition,
} from "./mcp-server-types";
import { isRecord } from "../../shared/server/type-guards";

export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const MCP_ENDPOINT = "/mcp";
export const MCP_MANIFEST_PATH = "/mcp/manifest";
export const MCP_DISABLED_MESSAGE = "MCP server is disabled.";
export const MCP_SERVER_INFO = {
  name: "mcp-server",
  title: "MCP Server",
  version: "1.0.0",
  description: "MCP adapter exposing registered tools, prompts, and derived resources.",
};
export const MCP_SERVER_INSTRUCTIONS = [
  "This MCP server exposes tools from tool-registry and prompts from ai-agents.",
  "The standard MCP endpoint is /mcp.",
  "GET /mcp is intentionally not offered as an SSE stream by this implementation and returns HTTP 405.",
  "GET /mcp/manifest and services/list are helper extensions for inspecting the composed adapter surface.",
].join(" ");

const MCP_MANIFEST_RESOURCE_URI = "mcp://manifest";
const LIST_PAGE_SIZE = 100;
const SERVICES_EXTENSION_CAPABILITY = "composed.services";

export type ParsedJsonRpcMessage =
  | { kind: "request"; id: McpJsonRpcRequestId; method: string; params: unknown }
  | { kind: "notification"; method: string; params: unknown }
  | { kind: "response"; id?: McpJsonRpcRequestId; result?: unknown; error?: unknown }
  | { kind: "invalid"; error: McpJsonRpcErrorResponse };

export function buildInvalidMcpJsonBodyResponse(): McpJsonRpcErrorResponse {
  return failure(undefined, -32600, "Expected a JSON-RPC 2.0 JSON body.");
}

export function buildUnsupportedProtocolVersionResponse(
  requested: unknown,
  supported: readonly string[],
  id?: McpJsonRpcRequestId,
): McpJsonRpcErrorResponse {
  return buildMcpJsonRpcErrorResponse(id, -32602, "Unsupported protocol version.", {
    requested,
    supported,
  });
}

export function buildMcpServerCapabilities() {
  return {
    completions: {},
    prompts: {},
    resources: {},
    tools: {},
    experimental: {
      [SERVICES_EXTENSION_CAPABILITY]: {},
    },
  };
}

export function buildMcpManifestFromServices(services: McpService[]): McpManifest {
  return cloneMcpManifest({
    endpoint: MCP_ENDPOINT,
    services: services.map((service) => cloneMcpServiceDefinition(service.definition)),
    helperRoutes: services.flatMap((service) => service.definition.helperRoutes),
    tools: services.flatMap((service) => service.definition.tools.map(cloneMcpToolDefinition)),
    prompts: services.flatMap((service) => service.definition.prompts.map(cloneMcpPromptDefinition)),
    resources: buildMcpResourcesFromServices(services),
    resourceTemplates: buildMcpResourceTemplates(),
  });
}

export async function handleMcpRequestForServices(
  payload: unknown,
  services: McpService[],
): Promise<McpJsonRpcResponse> {
  const parsedMessage = parseJsonRpcMessage(payload);
  if (parsedMessage.kind !== "request") {
    return parsedMessage.kind === "invalid"
      ? parsedMessage.error
      : failure(undefined, -32600, "MCP request handling expects a JSON-RPC request object.");
  }

  const { id, method, params } = parsedMessage;

  try {
    if (method === "ping") {
      return success(id, {});
    }

    if (method === "tools/list") {
      const pagination = parsePaginationParams(params);
      const manifest = buildMcpManifestFromServices(services);
      const page = paginateItems(manifest.tools, pagination.cursor);
      return success(id, {
        tools: page.items,
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      });
    }

    if (method === "tools/call") {
      const parsedParams = asObject(params, "tools/call requires an object params payload.");
      if (parsedParams.task !== undefined) {
        return failure(id, -32601, "Task-augmented tool execution is not supported by this MCP server.");
      }

      const toolName = asString(parsedParams.name, 'tools/call requires a string "name".');
      const toolArgs = parsedParams.arguments === undefined
        ? {}
        : parsedParams.arguments;

      const service = services.find((candidate) => candidate.definition.tools.some((tool) => tool.name === toolName) && candidate.callTool);
      if (!service?.callTool) {
        return failure(id, -32601, `Tool "${toolName}" is not registered on the MCP server.`);
      }

      try {
        return success(id, await service.callTool(toolName, toolArgs));
      } catch (error) {
        return failure(id, -32602, error instanceof Error ? error.message : String(error));
      }
    }

    if (method === "prompts/list") {
      const pagination = parsePaginationParams(params);
      const manifest = buildMcpManifestFromServices(services);
      const page = paginateItems(manifest.prompts, pagination.cursor);
      return success(id, {
        prompts: page.items,
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      });
    }

    if (method === "prompts/get") {
      const parsedParams = asObject(params, "prompts/get requires an object params payload.");
      const promptName = asString(parsedParams.name, 'prompts/get requires a string "name".');
      const promptArgs = parsedParams.arguments === undefined
        ? {}
        : asStringRecord(parsedParams.arguments, 'prompts/get "arguments" must be an object of string values.');

      const service = services.find((candidate) => candidate.definition.prompts.some((prompt) => prompt.name === promptName) && candidate.getPrompt);
      if (!service?.getPrompt) {
        return failure(id, -32602, `Prompt "${promptName}" is not registered on the MCP server.`);
      }

      return success(id, await service.getPrompt(promptName, promptArgs));
    }

    if (method === "completion/complete") {
      const parsedParams = asObject(params, "completion/complete requires an object params payload.");
      const ref = asObject(parsedParams.ref, 'completion/complete requires a "ref" object.');
      const argument = asObject(parsedParams.argument, 'completion/complete requires an "argument" object.');
      const argumentName = asString(argument.name, 'completion/complete requires a string argument "name".');
      const argumentValue = asOptionalString(argument.value);
      const context = parsedParams.context === undefined
        ? {}
        : asObject(parsedParams.context, 'completion/complete "context" must be an object.');
      const contextArguments = context.arguments === undefined
        ? {}
        : asStringRecord(context.arguments, 'completion/complete "context.arguments" must be an object of string values.');

      if (ref.type === "ref/prompt") {
        const promptName = asString(ref.name, 'completion/complete prompt refs require a string "name".');
        const service = services.find((candidate) => candidate.definition.prompts.some((prompt) => prompt.name === promptName));
        if (!service) {
          return failure(id, -32602, `Prompt "${promptName}" is not registered on the MCP server.`);
        }

        if (!service.completePrompt) {
          return success(id, emptyCompletionResult());
        }

        const completion = await service.completePrompt(promptName, {
          argumentName,
          value: argumentValue,
          contextArguments,
        });
        return success(id, sanitizeCompletionResult(completion));
      }

      if (ref.type === "ref/resource") {
        return failure(id, -32601, "Resource template completions are not supported by this MCP server.");
      }

      return failure(id, -32602, `Unknown completion ref type "${String(ref.type)}".`);
    }

    if (method === "resources/list") {
      const pagination = parsePaginationParams(params);
      const manifest = buildMcpManifestFromServices(services);
      const page = paginateItems(manifest.resources, pagination.cursor);
      return success(id, {
        resources: page.items,
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      });
    }

    if (method === "resources/read") {
      const parsedParams = asObject(params, "resources/read requires an object params payload.");
      const uri = asString(parsedParams.uri, 'resources/read requires a string "uri".');
      const resource = readDerivedResource(uri, services);
      if (!resource) {
        return failure(id, -32602, `Resource "${uri}" is not registered on the MCP server.`);
      }

      return success(id, {
        contents: [resource],
      });
    }

    if (method === "resources/templates/list") {
      const pagination = parsePaginationParams(params);
      const page = paginateItems(buildMcpResourceTemplates(), pagination.cursor);
      return success(id, {
        resourceTemplates: page.items,
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      });
    }

    if (method === "services/list") {
      return success(id, buildMcpManifestFromServices(services));
    }

    if (method === "logging/setLevel") {
      return failure(id, -32601, "logging/setLevel is not supported by this MCP server.");
    }

    return failure(id, -32601, `Method "${method}" is not supported by the MCP endpoint.`);
  } catch (error) {
    return failure(id, -32602, error instanceof Error ? error.message : String(error));
  }
}

export function parseJsonRpcMessage(payload: unknown): ParsedJsonRpcMessage {
  if (!isRecord(payload)) {
    return {
      kind: "invalid",
      error: failure(undefined, -32600, "Expected a JSON-RPC request, notification, or response object."),
    };
  }

  if (payload.jsonrpc !== "2.0") {
    return {
      kind: "invalid",
      error: failure(asRequestId(payload.id), -32600, 'The MCP endpoint expects jsonrpc="2.0".'),
    };
  }

  if (typeof payload.method === "string") {
    if (payload.method.trim().length === 0) {
      return {
        kind: "invalid",
        error: failure(asRequestId(payload.id), -32600, "The JSON-RPC message is missing a valid method."),
      };
    }

    if (Object.prototype.hasOwnProperty.call(payload, "id")) {
      const id = asRequestId(payload.id);
      if (id === undefined) {
        return {
          kind: "invalid",
          error: failure(undefined, -32600, "JSON-RPC request ids must be strings or numbers."),
        };
      }

      return {
        kind: "request",
        id,
        method: payload.method,
        params: payload.params,
      };
    }

    return {
      kind: "notification",
      method: payload.method,
      params: payload.params,
    };
  }

  if (Object.prototype.hasOwnProperty.call(payload, "result") || Object.prototype.hasOwnProperty.call(payload, "error")) {
    return {
      kind: "response",
      ...(asRequestId(payload.id) !== undefined ? { id: asRequestId(payload.id) } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "result") ? { result: payload.result } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "error") ? { error: payload.error } : {}),
    };
  }

  return {
    kind: "invalid",
    error: failure(asRequestId(payload.id), -32600, "The JSON-RPC message is missing a method, result, or error."),
  };
}

function buildMcpResourcesFromServices(services: McpService[]): McpResourceDefinition[] {
  const manifest = buildManifestResourceDefinition();
  const serviceResources = services.flatMap((service) => buildServiceResources(service.definition));
  return [manifest, ...serviceResources].map(cloneMcpResourceDefinition);
}

function buildManifestResourceDefinition(): McpResourceDefinition {
  return {
    name: "manifest",
    title: "MCP manifest",
    uri: MCP_MANIFEST_RESOURCE_URI,
    description: "JSON document describing the composed MCP services, tools, prompts, and helper routes.",
    mimeType: "application/json",
  };
}

function buildServiceResources(service: McpServiceDefinition): McpResourceDefinition[] {
  const serviceUri = buildServiceResourceUri(service.id);
  const resources: McpResourceDefinition[] = [
    {
      name: service.id,
      title: service.title,
      uri: serviceUri,
      description: service.description,
      mimeType: "application/json",
    },
  ];

  for (const tool of service.tools) {
    resources.push({
      name: `${service.id}.${tool.name}`,
      title: tool.title ?? tool.name,
      uri: buildToolResourceUri(service.id, tool.name),
      description: tool.description,
      mimeType: "application/json",
    });
  }

  for (const prompt of service.prompts) {
    resources.push({
      name: `${service.id}.${prompt.name}`,
      title: prompt.title ?? prompt.name,
      uri: buildPromptResourceUri(service.id, prompt.name),
      description: prompt.description,
      mimeType: "application/json",
    });
  }

  return resources;
}

function buildMcpResourceTemplates(): McpResourceTemplateDefinition[] {
  return [];
}

function readDerivedResource(
  uri: string,
  services: McpService[],
): { uri: string; mimeType: string; text: string } | undefined {
  if (uri === MCP_MANIFEST_RESOURCE_URI) {
    return createJsonResourceContents(uri, buildMcpManifestFromServices(services));
  }

  const serviceMatch = /^mcp:\/\/services\/([^/]+)$/.exec(uri);
  if (serviceMatch) {
    const serviceId = decodeURIComponent(serviceMatch[1] ?? "");
    const service = services.find((entry) => entry.definition.id === serviceId);
    return service
      ? createJsonResourceContents(uri, service.definition)
      : undefined;
  }

  const toolMatch = /^mcp:\/\/services\/([^/]+)\/tools\/([^/]+)$/.exec(uri);
  if (toolMatch) {
    const serviceId = decodeURIComponent(toolMatch[1] ?? "");
    const toolName = decodeURIComponent(toolMatch[2] ?? "");
    const service = services.find((entry) => entry.definition.id === serviceId);
    const tool = service?.definition.tools.find((entry) => entry.name === toolName);
    return tool
      ? createJsonResourceContents(uri, tool)
      : undefined;
  }

  const promptMatch = /^mcp:\/\/services\/([^/]+)\/prompts\/([^/]+)$/.exec(uri);
  if (promptMatch) {
    const serviceId = decodeURIComponent(promptMatch[1] ?? "");
    const promptName = decodeURIComponent(promptMatch[2] ?? "");
    const service = services.find((entry) => entry.definition.id === serviceId);
    const prompt = service?.definition.prompts.find((entry) => entry.name === promptName);
    return prompt
      ? createJsonResourceContents(uri, prompt)
      : undefined;
  }

  return undefined;
}

function createJsonResourceContents(uri: string, payload: unknown) {
  return {
    uri,
    mimeType: "application/json",
    text: `${JSON.stringify(payload, null, 2)}\n`,
  };
}

function buildServiceResourceUri(serviceId: string): string {
  return `mcp://services/${encodeURIComponent(serviceId)}`;
}

function buildToolResourceUri(serviceId: string, toolName: string): string {
  return `${buildServiceResourceUri(serviceId)}/tools/${encodeURIComponent(toolName)}`;
}

function buildPromptResourceUri(serviceId: string, promptName: string): string {
  return `${buildServiceResourceUri(serviceId)}/prompts/${encodeURIComponent(promptName)}`;
}

function sanitizeCompletionResult(result: McpCompletionResult): McpCompletionResult {
  const values = Array.from(new Set(result.completion.values.map((entry) => entry.trim()).filter((entry) => entry.length > 0)))
    .slice(0, 100);
  return {
    completion: {
      values,
      ...(typeof result.completion.total === "number" ? { total: result.completion.total } : {}),
      ...(typeof result.completion.hasMore === "boolean" ? { hasMore: result.completion.hasMore } : {}),
    },
  };
}

function emptyCompletionResult(): McpCompletionResult {
  return {
    completion: {
      values: [],
      total: 0,
      hasMore: false,
    },
  };
}

function parsePaginationParams(
  params: unknown,
): { cursor?: string } {
  if (params === undefined) {
    return {};
  }

  const parsed = asObject(params, "Paginated MCP methods require an object params payload.");
  if (parsed.cursor === undefined) {
    return {};
  }

  return {
    cursor: asString(parsed.cursor, 'Paginated MCP methods require a string "cursor".'),
  };
}

function paginateItems<T>(
  items: readonly T[],
  cursor?: string,
): { items: T[]; nextCursor?: string } {
  const startIndex = decodeCursor(cursor);
  const slice = items.slice(startIndex, startIndex + LIST_PAGE_SIZE);
  const nextIndex = startIndex + slice.length;

  return {
    items: slice.map((entry) => structuredClone(entry)),
    ...(nextIndex < items.length ? { nextCursor: encodeCursor(nextIndex) } : {}),
  };
}

function encodeCursor(index: number): string {
  return Buffer.from(JSON.stringify({ index }), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): number {
  if (!cursor) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { index?: unknown };
    if (typeof parsed.index !== "number" || !Number.isInteger(parsed.index) || parsed.index < 0) {
      throw new Error("Cursor index must be a non-negative integer.");
    }

    return parsed.index;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid pagination cursor: ${message}`);
  }
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(message);
  }

  return value;
}

function asString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }

  return value.trim();
}

function asOptionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringRecord(value: unknown, message: string): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error(message);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      typeof entryValue === "string"
        ? entryValue
        : String(entryValue ?? ""),
    ]),
  );
}

function success(id: McpJsonRpcRequestId, result: unknown): McpJsonRpcSuccessResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

export function buildMcpJsonRpcErrorResponse(
  id: McpJsonRpcRequestId | undefined,
  code: number,
  message: string,
  data?: unknown,
): McpJsonRpcErrorResponse {
  return {
    jsonrpc: "2.0",
    ...(id !== undefined ? { id } : {}),
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {}),
    },
  };
}

function failure(
  id: McpJsonRpcRequestId | undefined,
  code: number,
  message: string,
  data?: unknown,
): McpJsonRpcErrorResponse {
  return buildMcpJsonRpcErrorResponse(id, code, message, data);
}

function asRequestId(value: unknown): McpJsonRpcRequestId | undefined {
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}
