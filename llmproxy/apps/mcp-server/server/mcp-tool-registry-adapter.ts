import type { RequestFetch } from "../../shared/server/request-fetch";
import type {
  McpBlobResourceContents,
  McpToolCallResult,
  McpService,
  McpTextResourceContents,
} from "./mcp-server-types";
import { cloneMcpServiceDefinition } from "./mcp-server-types";
import { isRecord } from "../../shared/server/type-guards";
import {
  buildToolRegistryInternalToolPath,
  toolRegistryInternalServicesPath,
} from "../../tool-registry/server/tool-registry-capability";

interface InternalToolRegistryServicesPayload {
  services: Array<{
    id: string;
    title: string;
    description: string;
    helperRoutes: Array<{
      method: "GET" | "POST";
      path: string;
      title: string;
      description: string;
    }>;
    tools: Array<{
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      outputSchema?: Record<string, unknown>;
    }>;
  }>;
}

interface InternalToolRegistryToolCallPayload {
  content: Array<{ type: "text" | "json"; text?: string; json?: unknown }>;
  structuredContent?: unknown;
  bytesBase64?: string;
  mimeType?: string;
  isError?: boolean;
}

export async function fetchMcpToolRegistryServices(
  requestFetch: RequestFetch,
  fetchOptionalPayload: <T>(requestFetch: RequestFetch, path: string) => Promise<T | undefined>,
): Promise<McpService[]> {
  const payload = await fetchOptionalPayload<InternalToolRegistryServicesPayload>(
    requestFetch,
    toolRegistryInternalServicesPath,
  );
  if (!payload) {
    return [];
  }

  return payload.services.map((service) => ({
    definition: cloneMcpServiceDefinition({
      id: service.id,
      title: service.title,
      description: service.description,
      helperRoutes: service.helperRoutes,
      tools: service.tools,
      prompts: [],
    }),
    callTool: async (toolName, args) => mapToolRegistryToolCallResult(
      service.id,
      toolName,
      await requestFetch<InternalToolRegistryToolCallPayload>(
        buildToolRegistryInternalToolPath(service.id, toolName),
        {
          method: "POST",
          body: {
            arguments: args,
          },
        },
      ),
    ),
  }));
}

function mapToolRegistryToolCallResult(
  serviceId: string,
  toolName: string,
  result: InternalToolRegistryToolCallPayload,
) {
  const content: McpToolCallResult["content"] = result.content.map((entry, index) => {
    if (entry.type === "text") {
      return {
        type: "text" as const,
        text: entry.text ?? "",
      };
    }

    return {
      type: "resource" as const,
      resource: createEmbeddedTextResource(
        buildToolResultJsonContentUri(serviceId, toolName, index),
        JSON.stringify(entry.json ?? null, null, 2),
        "application/json",
      ),
    };
  });

  if (result.bytesBase64 !== undefined) {
    content.push({
      type: "resource" as const,
      resource: createEmbeddedBlobResource(
        buildToolResultBytesUri(serviceId, toolName),
        result.bytesBase64,
        result.mimeType ?? "application/octet-stream",
      ),
    });
  }

  return {
    content,
    ...(isRecord(result.structuredContent) ? { structuredContent: result.structuredContent } : {}),
    ...(result.isError ? { isError: true } : {}),
  };
}

function buildToolResultJsonContentUri(serviceId: string, toolName: string, index: number): string {
  return `mcp://services/${encodeURIComponent(serviceId)}/tools/${encodeURIComponent(toolName)}/content/${index}.json`;
}

function buildToolResultBytesUri(serviceId: string, toolName: string): string {
  return `mcp://services/${encodeURIComponent(serviceId)}/tools/${encodeURIComponent(toolName)}/result.bin`;
}

function createEmbeddedTextResource(
  uri: string,
  text: string,
  mimeType: string,
): McpTextResourceContents {
  return {
    uri,
    mimeType,
    text,
  };
}

function createEmbeddedBlobResource(
  uri: string,
  blob: string,
  mimeType: string,
): McpBlobResourceContents {
  return {
    uri,
    mimeType,
    blob,
  };
}
