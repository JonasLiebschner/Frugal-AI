export { DEFAULT_OTEL_CONFIG, normalizeOtelConfig, serializeOtelConfig } from "./otel-config";
export { createOtelConfigService } from "./otel-config-service";
export { createOtelNitroCapability, createOtelService } from "./otel-runtime";

export type {
  OtelConfigServiceOptions,
} from "./otel-config-types";
export type {
  OtelConfig,
  OtelConfigService,
  OtelTraceEventInput,
  OtelTraceInput,
  OtelTracesService,
  OtelNitroCapability,
  OtelService,
} from "./otel-types";
