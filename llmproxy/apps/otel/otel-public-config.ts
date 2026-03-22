import type { OtelConfig } from "./server/otel-types";

export interface OtelPublicConfig {
  enabled: boolean;
  endpoint?: string;
  headersConfigured: boolean;
  timeoutMs: number;
  serviceName: string;
  serviceNamespace?: string;
  deploymentEnvironment?: string;
  captureMessageContent: boolean;
  captureToolContent: boolean;
}

export function toOtelPublicConfig(config: OtelConfig): OtelPublicConfig {
  return {
    enabled: config.enabled,
    endpoint: config.endpoint,
    headersConfigured: Boolean(config.headers && Object.keys(config.headers).length > 0),
    timeoutMs: config.timeoutMs,
    serviceName: config.serviceName,
    serviceNamespace: config.serviceNamespace,
    deploymentEnvironment: config.deploymentEnvironment,
    captureMessageContent: config.captureMessageContent,
    captureToolContent: config.captureToolContent,
  };
}
