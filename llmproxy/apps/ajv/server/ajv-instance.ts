import Ajv from "ajv8";
import addFormats from "ajv-formats";

import type {
  Ajv as AjvInstance,
  AjvFormat,
  KeywordDefinition,
  Options,
} from "./ajv-library-types";

export function createAjv(options: Options = {}): AjvInstance {
  const ajv = new Ajv({
    allErrors: true,
    verbose: true,
    strict: false,
    addUsedSchema: false,
    $data: true,
    ...options,
  });

  addFormats(ajv);

  return ajv as AjvInstance;
}

export function filledAjv(
  keywords: KeywordDefinition[],
  formats: AjvFormat[],
  ajv?: AjvInstance,
): AjvInstance {
  const resolvedAjv = ajv ?? createAjv();

  for (const keyword of keywords) {
    resolvedAjv.addKeyword(keyword);
  }

  for (const { id, format } of formats) {
    resolvedAjv.addFormat(id, format);
  }

  return resolvedAjv;
}

