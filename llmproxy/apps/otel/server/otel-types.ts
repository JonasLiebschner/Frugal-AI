import type { Attributes, SpanKind, SpanStatus, TimeInput } from "@opentelemetry/api";
import type { JsonValue, RequestOtelDebug } from "../../shared/type-api";

export interface OtelConfig {
  enabled: boolean;
  endpoint?: string;
  headers?: Record<string, string>;
  timeoutMs: number;
  serviceName: string;
  serviceNamespace?: string;
  deploymentEnvironment?: string;
  captureMessageContent: boolean;
  captureToolContent: boolean;
}

export interface OtelConfigService {
  configPath: string;
  load: () => Promise<OtelConfig>;
  save: (config: OtelConfig) => void;
}

export interface OtelTraceEventInput {
  name: string;
  attributes?: Attributes;
  time?: TimeInput;
}

export interface OtelTraceInput {
  name: string;
  kind?: SpanKind;
  startTime?: TimeInput;
  endTime?: TimeInput;
  attributes?: Attributes;
  status?: SpanStatus;
  events?: OtelTraceEventInput[];
}

export interface OtelTracesService {
  readonly enabled: boolean;
  readonly captureMessageContent: boolean;
  readonly captureToolContent: boolean;
  record: (
    scopeName: string,
    span: OtelTraceInput,
    debugContext?: {
      requestId: string;
      span: JsonValue;
      onUpdate?: (debug: RequestOtelDebug) => void;
    },
  ) => void;
  forceFlush: () => Promise<void>;
  shutdown: () => Promise<void>;
}

export interface OtelNitroCapability {
  configService: OtelConfigService;
  traces: OtelTracesService;
  reload: () => Promise<OtelConfig>;
}

export interface OtelService extends OtelNitroCapability {
  stop: () => Promise<void>;
}
