import type {
  JsonSchemaValidationResult,
} from "../../json-schema/server/json-schema-capability";
import type {
  Ajv as AjvInstance,
  AnySchema,
} from "./ajv-library-types";
import { filledAjv } from "./ajv-instance";
import { validateAjvSchema } from "./ajv-validation";
import type {
  AjvFormat,
  AjvPluginRegistrySource,
  AjvService,
  KeywordDefinition,
} from "./ajv-types";
import type { PluginsCapability } from "../../plugins/server/plugins-capability";

async function validateWithAjv(
  ajv: AjvInstance,
  schema: unknown,
  data: unknown,
): Promise<void> {
  const { valid, errors } = await validateAjvSchema(ajv, schema, data);

  if (!valid) {
    throw errors;
  }
}

async function validateDetailedWithAjv(
  ajv: AjvInstance,
  schema: unknown,
  data: unknown,
): Promise<JsonSchemaValidationResult> {
  const { valid, errors } = await validateAjvSchema(ajv, schema, data);
  return { valid, errors };
}

export function createAjvService(
  plugins: AjvPluginRegistrySource,
  validateSchema: (
    ajv: AjvInstance,
    schema: unknown,
    data: unknown,
  ) => Promise<void> = validateWithAjv,
  validateSchemaDetailed: (
    ajv: AjvInstance,
    schema: unknown,
    data: unknown,
  ) => Promise<JsonSchemaValidationResult> = validateDetailedWithAjv,
): AjvService {
  const createFilledAjv = (): AjvInstance => {
    const keywords = plugins.getList<KeywordDefinition>("ajv:keywords");
    const formats = plugins.getList<AjvFormat>("ajv:formats");

    return filledAjv(keywords, formats);
  };

  let ajv: AjvInstance | undefined;

  const getFilledAjv = (): AjvInstance => {
    ajv ??= createFilledAjv();
    return ajv;
  };

  return {
    compileSchema: (schema: unknown) => getFilledAjv().compile(schema as AnySchema),
    validate: async (data: unknown, schema: unknown) => {
      await validateSchema(getFilledAjv(), schema, data);
    },
    validateDetailed: async (data: unknown, schema: unknown) => (
      validateSchemaDetailed(getFilledAjv(), schema, data)
    ),
  };
}

export function createAjvServiceFromPlugins(
  plugins: PluginsCapability,
): AjvService {
  return createAjvService({
    getList: (registryName) => plugins.getList(registryName),
  });
}

export function createStandaloneAjvService(options: {
  keywords?: KeywordDefinition[];
  formats?: AjvFormat[];
} = {}): AjvService {
  const keywords = options.keywords ?? [];
  const formats = options.formats ?? [];

  return createAjvService({
    getList: <TValue>(registryName: string): TValue[] => {
      if (registryName === "ajv:keywords") {
        return keywords as TValue[];
      }

      if (registryName === "ajv:formats") {
        return formats as TValue[];
      }

      return [];
    },
  });
}
