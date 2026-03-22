import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from "h3";
import type { ToolCallResult } from "../../../../../../../tool-registry-types";

function asArguments(value: unknown): unknown {
  if (value === undefined) {
    return {};
  }

  return value;
}

export default defineEventHandler(async (event) => {
  const serviceId = getRouterParam(event, "serviceId");
  const toolName = getRouterParam(event, "toolName");

  if (!serviceId || !toolName) {
    setResponseStatus(event, 404);
    return createErrorResponse("Internal tool-registry route was not found.");
  }

  const body = await readBody(event);
  const args = asArguments(
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).arguments
      : undefined,
  );

  try {
    return serializeToolRegistryCallResult(
      await event.context.toolRegistry.callTool(serviceId, toolName, args),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setResponseStatus(
      event,
      message === `Tool service "${serviceId}" was not found.` ? 404 : 400,
    );
    return createErrorResponse(message);
  }
});

function createErrorResponse(message: string): { error: { message: string; type: string } } {
  return {
    error: {
      message,
      type: "tool_registry_error",
    },
  };
}

function serializeToolRegistryCallResult(
  result: ToolCallResult,
): InternalToolRegistryCallResultPayload {
  return {
    content: result.content.map((entry) => ({ ...entry })),
    ...(result.structuredContent !== undefined ? { structuredContent: result.structuredContent } : {}),
    ...(result.bytes !== undefined ? { bytesBase64: Buffer.from(result.bytes).toString("base64") } : {}),
    ...(result.mimeType ? { mimeType: result.mimeType } : {}),
    ...(result.isError ? { isError: true } : {}),
  };
}

interface InternalToolRegistryCallResultPayload {
  content: Array<{ type: "text" | "json"; text?: string; json?: unknown }>;
  structuredContent?: unknown;
  bytesBase64?: string;
  mimeType?: string;
  isError?: boolean;
}
