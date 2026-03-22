import type {
  Ajv,
  AnySchema,
  ErrorObject,
  SchemaValidateFunction,
} from "./ajv-library-types";

type ValidateResult = {
  valid: boolean;
  errors: ErrorObject[];
};

type ErrorContainer = {
  errors?: ErrorObject[] | null;
};

export async function validateAjvSchema(
  ajv: Ajv,
  schema: unknown,
  data: unknown,
): Promise<ValidateResult> {
  const validator = ajv.compile(schema as AnySchema) as SchemaValidateFunction;

  try {
    const result = validator(data);

    if (isPromiseLike(result)) {
      await result;
      return createResult(true);
    }

    return createResult(result, validator);
  } catch (error: unknown) {
    return createResult(false, error);
  }
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as Promise<unknown>).then === "function"
  );
}

function createResult(
  result: boolean | unknown,
  error?: ErrorContainer | ErrorObject[] | Error | string | unknown | null,
): ValidateResult {
  return {
    valid: !!result,
    errors: readErrors(error),
  };
}

function readErrors(
  error?: ErrorContainer | ErrorObject[] | Error | string | unknown | null,
): ErrorObject[] {
  if (!error) {
    return [];
  }

  if (typeof error === "object" && "errors" in error && Array.isArray(error.errors)) {
    return error.errors;
  }

  if (Array.isArray(error)) {
    return error.filter(
      (entry): entry is ErrorObject => typeof entry === "object" && entry !== null,
    );
  }

  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return [
      {
        keyword: "error",
        instancePath: "",
        schemaPath: "",
        params: {},
        message: error.message,
      },
    ];
  }

  if (typeof error === "string") {
    return [
      {
        keyword: "unsupported",
        instancePath: "",
        schemaPath: "",
        params: {},
        message: error,
      },
    ];
  }

  return [];
}

