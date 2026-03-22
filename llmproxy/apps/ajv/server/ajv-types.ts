import type {
  JsonSchemaValidationService,
} from "../../json-schema/server/json-schema-capability";
import type {
  AjvFormat,
  KeywordDefinition,
} from "./ajv-library-types";

export type AjvService = JsonSchemaValidationService;

export interface AjvPluginRegistrySource {
  getList: <TValue = unknown>(registryName: string) => TValue[];
}

export type {
  AjvFormat,
  KeywordDefinition,
};
