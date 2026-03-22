import type {
  JsonSchemaValidationError,
  JsonSchemaValidationService,
  JsonSchemaValidateFunction,
} from "../../json-schema/server/json-schema-capability";
import { useSchemaValidationService } from "../../json-schema/server/json-schema-capability";
import type { RequestFetch } from "../../shared/server/request-fetch";
import { isRecord } from "../../shared/server/type-guards";
import {
  cloneHelperRoutes,
  createServiceRouteLookup,
  dedupeHelperRoutes,
  registerRegistryProviders,
  resolveRegistryProviders,
} from "../../shared/server/service-registry";
import {
  cloneToolDefinition,
  type ToolProvider,
  type ToolRegistrar,
  type ToolRegistryRouteContext,
  type ToolRegistryServiceRegistry,
  type ToolRegistryServiceRegistryOptions,
} from "./tool-registry-types";
import type {
  ToolRegistryHelperRouteDefinition,
  ToolRegistryService,
  ToolRegistryServiceMetadata,
  ToolCallResult,
  ToolDefinition,
  ToolRegistration,
} from "./tool-registry-types";

export function createToolRegistryServiceRegistry<TContext = any>(
  options: ToolRegistryServiceRegistryOptions = {},
): ToolRegistryServiceRegistry<TContext> {
  const toolProviders = new Set<ToolProvider<TContext>>();
  const toolInputValidatorCache = new Map<string, JsonSchemaValidateFunction>();
  const toolOutputValidatorCache = new Map<string, JsonSchemaValidateFunction>();
  const validation = resolveValidationService(options);
  const getServicesForContext = (context: TContext) => buildSyntheticServices(
    resolveRegistryProviders(toolProviders, context),
    context,
    validation,
    toolInputValidatorCache,
    toolOutputValidatorCache,
  );

  return {
    registerTool: (provider) => registerRegistryProviders(toolProviders, provider),
    getServices: getServicesForContext,
    bindRequestFetch: (requestFetch) => ({
      ...createServiceRouteLookup(
        () => getServicesForContext(requestFetch as TContext),
        (service) => service.definition.id,
      ),
      callTool: async (serviceId, toolName, args) => {
        const service = getServicesForContext(requestFetch as TContext)
          .find((entry) => entry.definition.id === serviceId);

        if (!service) {
          throw new Error(`Tool service "${serviceId}" was not found.`);
        }

        return await service.callTool(toolName, args);
      },
    }),
  };
}

function resolveValidationService(
  options: ToolRegistryServiceRegistryOptions,
): JsonSchemaValidationService {
  if (options.validation) {
    return options.validation;
  }

  return useSchemaValidationService();
}

interface SyntheticServiceBucket<TContext> {
  metadata: ToolRegistryServiceMetadata;
  helperRoutes: ToolRegistryHelperRouteDefinition[];
  tools: ToolRegistration<TContext>[];
}

function buildSyntheticServices<TContext>(
  toolRegistrations: ToolRegistration<TContext>[],
  context: TContext,
  validation: JsonSchemaValidationService,
  toolInputValidatorCache: Map<string, JsonSchemaValidateFunction>,
  toolOutputValidatorCache: Map<string, JsonSchemaValidateFunction>,
): ToolRegistryService[] {
  if (toolRegistrations.length === 0) {
    return [];
  }

  const buckets = new Map<string, SyntheticServiceBucket<TContext>>();
  for (const registration of toolRegistrations) {
    const bucket = getSyntheticServiceBucket(buckets, registration.service);
    bucket.tools.push(registration);
  }

  return Array.from(buckets.values()).map((bucket) => ({
    definition: {
      id: bucket.metadata.id,
      title: bucket.metadata.title,
      description: bucket.metadata.description,
      helperRoutes: dedupeHelperRoutes(bucket.helperRoutes),
      tools: bucket.tools.map((registration) => cloneToolDefinition(registration.definition)),
    },
    callTool: async (toolName, args) => {
      const registration = bucket.tools.find((entry) => entry.definition.name === toolName);
      if (!registration) {
        throw new Error(`Unknown registry tool "${toolName}".`);
      }

      const validatedArgs = validateToolArguments(
        registration,
        args,
        validation,
        toolInputValidatorCache,
      );
      if (!validatedArgs.ok) {
        return validatedArgs.result;
      }

      return validateToolCallResult(
        registration,
        await registration.call(validatedArgs.args, context),
        validation,
        toolOutputValidatorCache,
      );
    },
  }));
}

function getSyntheticServiceBucket<TContext>(
  buckets: Map<string, SyntheticServiceBucket<TContext>>,
  metadata: ToolRegistryServiceMetadata,
): SyntheticServiceBucket<TContext> {
  const existing = buckets.get(metadata.id);
  if (existing) {
    if (Array.isArray(metadata.helperRoutes)) {
      existing.helperRoutes.push(...cloneHelperRoutes(metadata.helperRoutes));
    }
    return existing;
  }

  const created: SyntheticServiceBucket<TContext> = {
    metadata: {
      id: metadata.id,
      title: metadata.title,
      description: metadata.description,
      helperRoutes: cloneHelperRoutes(metadata.helperRoutes),
    },
    helperRoutes: cloneHelperRoutes(metadata.helperRoutes),
    tools: [],
  };
  buckets.set(metadata.id, created);
  return created;
}

type ToolArgumentValidationResult =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; result: ToolCallResult };

function validateToolArguments<TContext>(
  registration: ToolRegistration<TContext>,
  rawArgs: unknown,
  validation: JsonSchemaValidationService,
  toolInputValidatorCache: Map<string, JsonSchemaValidateFunction>,
): ToolArgumentValidationResult {
  const parsedArgsResult = parseToolArgumentsPayload(rawArgs);
  const message = `The tool "${registration.definition.name}" received invalid arguments.`;

  if (!parsedArgsResult.ok) {
    return {
      ok: false,
      result: buildToolErrorResult(registration.definition, message, rawArgs, parsedArgsResult.details),
    };
  }

  const normalizedArgs = parsedArgsResult.args;
  const validator = getToolInputValidator(registration, validation, toolInputValidatorCache);
  const valid = validator(normalizedArgs);

  if (valid && isRecord(normalizedArgs)) {
    return {
      ok: true,
      args: normalizedArgs,
    };
  }

  const details = (validator.errors ?? []).map((error) => formatToolArgumentValidationError(error));
  return {
    ok: false,
    result: buildToolErrorResult(registration.definition, message, normalizedArgs, details),
  };
}

function parseToolArgumentsPayload(
  rawArgs: unknown,
): { ok: true; args: unknown } | { ok: false; details: string[] } {
  if (typeof rawArgs !== "string") {
    return {
      ok: true,
      args: rawArgs,
    };
  }

  const trimmed = rawArgs.trim();
  if (!trimmed) {
    return {
      ok: true,
      args: {},
    };
  }

  try {
    return {
      ok: true,
      args: JSON.parse(trimmed) as unknown,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      details: [`The tool arguments payload is not valid JSON: ${message}`],
    };
  }
}

function getToolInputValidator<TContext>(
  registration: ToolRegistration<TContext>,
  validation: JsonSchemaValidationService,
  toolInputValidatorCache: Map<string, JsonSchemaValidateFunction>,
): JsonSchemaValidateFunction {
  const cacheKey = `${registration.service.id}:${registration.definition.name}:input`;
  const cached = toolInputValidatorCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const compiled = validation.compileSchema(registration.definition.inputSchema);
  toolInputValidatorCache.set(cacheKey, compiled);
  return compiled;
}

function buildToolErrorResult(
  definition: ToolDefinition,
  message: string,
  rawArgs: unknown,
  details: string[],
): ToolCallResult {
  const instructions = buildToolValidationInstructions(definition, rawArgs);
  const exampleArguments = extractToolSchemaExample(definition);
  const structuredContent = {
    ok: false,
    error: {
      type: "invalid_arguments",
      tool: definition.name,
      message,
      details,
      instructions,
      ...(exampleArguments !== undefined ? { exampleArguments } : {}),
    },
  };

  const textLines = [
    message,
    ...(details.length > 0 ? ["Details:", ...details.map((detail) => `- ${detail}`)] : []),
    "Instructions:",
    ...instructions.map((instruction) => `- ${instruction}`),
    ...(exampleArguments !== undefined
      ? ["Example arguments:", JSON.stringify(exampleArguments, null, 2)]
      : []),
  ];

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: textLines.join("\n"),
      },
      {
        type: "json",
        json: structuredContent,
      },
    ],
    structuredContent,
  };
}

function buildToolValidationInstructions(
  definition: ToolDefinition,
  rawArgs: unknown,
): string[] {
  const instructions = [
    `Pass exactly one JSON object that matches the "${definition.name}" input schema.`,
  ];

  if (typeof rawArgs === "string" && /}\s*{/.test(rawArgs)) {
    instructions.push("Do not concatenate multiple JSON objects into one arguments string.");
  } else if (Array.isArray(rawArgs)) {
    instructions.push("Do not send an array of request objects as tool arguments.");
  } else if (!isRecord(rawArgs)) {
    instructions.push("Tool arguments must resolve to one JSON object, not a string, array, or scalar value.");
  }

  return instructions;
}

function extractToolSchemaExample(definition: ToolDefinition): unknown {
  const examples = definition.inputSchema.examples;
  if (!Array.isArray(examples) || examples.length === 0) {
    return undefined;
  }

  return examples[0];
}

function formatToolArgumentValidationError(error: JsonSchemaValidationError): string {
  const path = formatJsonPointerPath(error.instancePath);

  if (error.keyword === "required" && typeof error.params.missingProperty === "string") {
    return `${path}.${error.params.missingProperty} is required.`;
  }

  if (error.keyword === "additionalProperties" && typeof error.params.additionalProperty === "string") {
    return `${path} includes unsupported field "${error.params.additionalProperty}".`;
  }

  if (error.keyword === "type" && typeof error.params.type === "string") {
    return `${path} must be ${error.params.type}.`;
  }

  if (error.keyword === "enum" && Array.isArray(error.params.allowedValues)) {
    return `${path} must be one of ${error.params.allowedValues.map((value) => String(value)).join(", ")}.`;
  }

  if (error.keyword === "minItems" && typeof error.params.limit === "number") {
    return `${path} must contain at least ${error.params.limit} item${error.params.limit === 1 ? "" : "s"}.`;
  }

  if (error.keyword === "oneOf" || error.keyword === "anyOf") {
    return `${path} does not match any allowed input shape.`;
  }

  return `${path} ${error.message ?? "is invalid"}.`;
}

function formatJsonPointerPath(pointer: string): string {
  if (!pointer) {
    return "arguments";
  }

  const parts = pointer
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));

  let path = "arguments";
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      path += `[${part}]`;
    } else {
      path += `.${part}`;
    }
  }

  return path;
}

function validateToolCallResult<TContext>(
  registration: ToolRegistration<TContext>,
  result: ToolCallResult,
  validation: JsonSchemaValidationService,
  toolOutputValidatorCache: Map<string, JsonSchemaValidateFunction>,
): ToolCallResult {
  if (result.isError) {
    return result;
  }

  if (registration.definition.outputSchema) {
    if (result.structuredContent === undefined) {
      throw new Error(`Tool "${registration.definition.name}" declared an outputSchema but returned no structuredContent.`);
    }

    const validator = getToolOutputValidator(registration, validation, toolOutputValidatorCache);
    const valid = validator(result.structuredContent);
    if (!valid) {
      const details = (validator.errors ?? []).map((error) => formatAjvValidationError(error)).join(" ");
      throw new Error(`Tool "${registration.definition.name}" returned structuredContent that does not match its outputSchema.${details ? ` ${details}` : ""}`);
    }

    return result;
  }

  if (result.structuredContent !== undefined) {
    throw new Error(`Tool "${registration.definition.name}" returned structuredContent but did not declare an outputSchema.`);
  }

  if (result.bytes === undefined) {
    throw new Error(`Tool "${registration.definition.name}" must return bytes when no outputSchema is declared.`);
  }

  return result;
}

function getToolOutputValidator<TContext>(
  registration: ToolRegistration<TContext>,
  validation: JsonSchemaValidationService,
  toolOutputValidatorCache: Map<string, JsonSchemaValidateFunction>,
): JsonSchemaValidateFunction {
  const cacheKey = `${registration.service.id}:${registration.definition.name}`;
  const cached = toolOutputValidatorCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const outputSchema = registration.definition.outputSchema;
  if (!outputSchema) {
    throw new Error(`Tool "${registration.definition.name}" has no outputSchema.`);
  }

  const compiled = validation.compileSchema(outputSchema);
  toolOutputValidatorCache.set(cacheKey, compiled);
  return compiled;
}

function formatAjvValidationError(error: JsonSchemaValidationError): string {
  const path = error.instancePath ? `structuredContent${error.instancePath.replaceAll("/", ".")}` : "structuredContent";

  if (error.keyword === "required" && typeof error.params.missingProperty === "string") {
    return `${path}.${error.params.missingProperty} is required.`;
  }

  if (error.keyword === "additionalProperties" && typeof error.params.additionalProperty === "string") {
    return `${path} includes unsupported field "${error.params.additionalProperty}".`;
  }

  if (error.keyword === "type" && typeof error.params.type === "string") {
    return `${path} must be ${error.params.type}.`;
  }

  if (error.keyword === "enum" && Array.isArray(error.params.allowedValues)) {
    return `${path} must be one of ${error.params.allowedValues.map((value) => String(value)).join(", ")}.`;
  }

  return `${path} ${error.message ?? "is invalid"}.`;
}
