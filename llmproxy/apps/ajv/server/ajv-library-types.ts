import type Ajv from "ajv8";
import type {
  AnySchema,
  ErrorObject,
  Format,
  KeywordDefinition,
  Options,
  ValidateFunction,
} from "ajv8";

export type { AnySchema, ErrorObject, Format, KeywordDefinition, Options };
export type { Ajv };
export type SchemaValidateFunction = ValidateFunction;

export type AjvFormat = {
  id: string;
  format: Format;
};

