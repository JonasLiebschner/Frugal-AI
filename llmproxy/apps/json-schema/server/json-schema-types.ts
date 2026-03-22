export interface JsonSchemaValidationError {
  instancePath: string;
  keyword: string;
  params: {
    missingProperty?: string;
    additionalProperty?: string;
    allowedValues?: unknown[];
    type?: string;
    [key: string]: unknown;
  };
  message?: string;
}

export interface JsonSchemaValidationResult {
  valid: boolean;
  errors?: JsonSchemaValidationError[] | null;
}

export interface JsonSchemaValidateFunction {
  (data: unknown): unknown;
  errors?: JsonSchemaValidationError[] | null;
}

export interface JsonSchemaValidationService {
  compileSchema: (schema: unknown) => JsonSchemaValidateFunction;
  validate: (data: unknown, schema: unknown) => Promise<void>;
  validateDetailed: (data: unknown, schema: unknown) => Promise<JsonSchemaValidationResult>;
}

export interface AppConfigSchemaDefinition {
  id: string;
  schema: unknown;
}

export interface AppConfigSchemaRegistrySource {
  register: (
    definitions: AppConfigSchemaDefinition | AppConfigSchemaDefinition[],
  ) => AppConfigSchemaDefinition[];
  get: (packageName: string) => AppConfigSchemaDefinition | undefined;
  list: () => AppConfigSchemaDefinition[];
}

export type JsonSchemaAccessMode = "read" | "write";

export interface JsonSchemaAccessViolation {
  instancePath: string;
  keyword: "readOnly" | "writeOnly";
  message: string;
}
