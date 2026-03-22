import type { TestLayerRuntime } from "../../shared/test/test-layer-runtime";
import {
  createRouteBundleTestRuntime,
} from "../../shared/test/test-layer-runtime";
import {
  createStandaloneAjvService,
} from "../server/ajv-capability";
import type {
  AjvFormat,
  AjvService,
  KeywordDefinition,
} from "../server/ajv-capability";
import { ajvTestRouteBundle } from "./route-bundle";

export interface AjvTestRuntimeOptions {
  keywords?: KeywordDefinition[];
  formats?: AjvFormat[];
}

export interface AjvTestRuntime extends TestLayerRuntime {
  ajv: AjvService;
}

export function createAjvTestValidationService(
  options: AjvTestRuntimeOptions = {},
): AjvService {
  return createStandaloneAjvService(options);
}

export function createAjvTestRuntime(
  options: AjvTestRuntimeOptions = {},
): AjvTestRuntime {
  const ajv = createAjvTestValidationService(options);

  return createRouteBundleTestRuntime({ ajv }, ajvTestRouteBundle);
}
