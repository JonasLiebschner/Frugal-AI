import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from "h3";

function asRequiredString(value: unknown, message: string): string {
  if (typeof value !== "string") {
    throw new Error(message);
  }

  return value;
}

function asContextArguments(value: unknown): Record<string, string> {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error('Internal ai-agents completion calls require an object "contextArguments" payload.');
  }

  const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
    key,
    asRequiredString(entryValue, `Completion context argument "${key}" must be a string.`),
  ]);

  return Object.fromEntries(entries);
}

export default defineEventHandler(async (event) => {
  const serviceId = getRouterParam(event, "serviceId");
  const promptName = getRouterParam(event, "promptName");

  if (!serviceId || !promptName) {
    setResponseStatus(event, 404);
    return createErrorResponse("Internal ai-agents completion route was not found.");
  }

  try {
    const body = await readBody(event);
    const payload = typeof body === "object" && body !== null && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};

    return await event.context.aiAgents.completePrompt(serviceId, promptName, {
      argumentName: asRequiredString(
        payload.argumentName,
        'Internal ai-agents completion calls require a string "argumentName" payload.',
      ),
      value: asRequiredString(
        payload.value,
        'Internal ai-agents completion calls require a string "value" payload.',
      ),
      contextArguments: asContextArguments(payload.contextArguments),
    });
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
