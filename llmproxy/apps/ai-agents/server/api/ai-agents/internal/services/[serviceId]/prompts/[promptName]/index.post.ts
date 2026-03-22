import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from "h3";

function asArguments(value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error('Internal ai-agents prompt calls require an object "arguments" payload.');
  }

  return value as Record<string, unknown>;
}

export default defineEventHandler(async (event) => {
  const serviceId = getRouterParam(event, "serviceId");
  const promptName = getRouterParam(event, "promptName");

  if (!serviceId || !promptName) {
    setResponseStatus(event, 404);
    return createErrorResponse("Internal ai-agents route was not found.");
  }

  const body = await readBody(event);
  const args = asArguments(
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).arguments
      : undefined,
  );

  try {
    return await event.context.aiAgents.getPrompt(serviceId, promptName, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setResponseStatus(
      event,
      message === `Prompt service "${serviceId}" was not found.` ? 404 : 400,
    );
    return createErrorResponse(message);
  }
});

function createErrorResponse(message: string): { error: { message: string; type: string } } {
  return {
    error: {
      message,
      type: "ai_agents_error",
    },
  };
}
