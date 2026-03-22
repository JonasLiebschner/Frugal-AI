import { createError, defineEventHandler, readBody } from "h3";
import { useSchemaValidationService } from "../../../../json-schema/server/json-schema-capability";

type ValidateRequestBody = {
  schema?: unknown;
  data?: unknown;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<ValidateRequestBody>(event);
  const schema = body?.schema;

  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid schema",
    });
  }

  const validation = useSchemaValidationService();
  const { valid, errors } = await validation.validateDetailed(body?.data, schema);

  return {
    valid,
    errors,
  };
});
