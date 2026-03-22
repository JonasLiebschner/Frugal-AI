import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { validateRegisteredConfigPayload } from "../../config-validation";

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as { data?: Record<string, unknown> } | null;
  const data = body?.data;

  if (!data || typeof data !== "object") {
    throw new Error("invalid data");
  }

  for (const [packageName, config] of Object.entries(data)) {
    const validationError = await validateRegisteredConfigPayload(
      event,
      packageName,
      config,
    );
    if (validationError) {
      return validationError;
    }
  }

  for (const [packageName, config] of Object.entries(data)) {
    event.context.config.writeConfigFile(packageName, config);
  }

  setResponseStatus(event, 201);
});
