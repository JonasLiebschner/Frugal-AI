import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from "h3";
import { validateRegisteredConfigPayload } from "../../../config-validation";

export default defineEventHandler(async (event) => {
  const packageName = getRouterParam(event, "id");
  if (!packageName) {
    throw new Error("invalid id");
  }

  const body = await readBody(event) as { data?: unknown } | null;
  if (body?.data === undefined) {
    throw new Error("invalid data");
  }

  const validationError = await validateRegisteredConfigPayload(
    event,
    packageName,
    body.data,
  );
  if (validationError) {
    return validationError;
  }

  event.context.config.writeConfigFile(packageName, body.data);
  setResponseStatus(event, 201);
});
