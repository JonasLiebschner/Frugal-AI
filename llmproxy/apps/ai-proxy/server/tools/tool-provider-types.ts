import type { RequestFetch } from "../../../shared/server/request-fetch";
import type { ServiceHelperRouteDefinition } from "../../../shared/server/service-registry";

export interface AiProxyToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export type AiProxyToolHelperRouteDefinition = ServiceHelperRouteDefinition;

export interface AiProxyToolServiceMetadata {
  id: string;
  title: string;
  description: string;
  helperRoutes?: AiProxyToolHelperRouteDefinition[];
}

export interface AiProxyToolCallResult {
  content: Array<{ type: "text" | "json"; text?: string; json?: unknown }>;
  structuredContent?: unknown;
  bytes?: Uint8Array;
  mimeType?: string;
  isError?: boolean;
}

export interface AiProxyToolRegistration {
  service: AiProxyToolServiceMetadata;
  definition: AiProxyToolDefinition;
  call: (
    args: Record<string, unknown>,
    requestFetch: RequestFetch,
  ) => AiProxyToolCallResult | Promise<AiProxyToolCallResult>;
}

export type AiProxyToolProvider = (
  requestFetch: RequestFetch,
) => AiProxyToolRegistration | AiProxyToolRegistration[];
