import { setResponseStatus, type H3Event } from "h3";

import { proxyError } from "../../shared/server/http-utils";
import { useSchemaValidationService } from "../../json-schema/server/json-schema-capability";

export async function validateRegisteredConfigPayload(
  event: H3Event,
  packageName: string,
  data: unknown,
): Promise<{
  error: { message: string; type: string };
  validationErrors?: unknown[];
  accessViolations?: unknown[];
} | undefined> {
  const schema = event.context.config.getSchema(packageName)?.schema;
  if (schema === undefined) {
    return undefined;
  }

  const validation = event.context.config.validation ?? useSchemaValidationService();
  const result = await validation.validateDetailed(data, schema);
  if (result.valid) {
    const accessViolations = event.context.config.listConfigAccessViolations(
      packageName,
      data,
      "write",
    );
    if (accessViolations.length === 0) {
      return undefined;
    }

    setResponseStatus(event, 400);
    return {
      ...proxyError(`Config for "${packageName}" contains read-only fields.`, "config_read_only_error"),
      accessViolations,
    };
  }

  setResponseStatus(event, 400);
  return {
    ...proxyError(`Invalid config for "${packageName}".`, "config_validation_error"),
    validationErrors: result.errors ?? [],
  };
}
