import { cloneHelperRoutes } from "../../shared/server/service-registry";
import type { JsonSchemaValidationService } from "../../json-schema/server/json-schema-capability";
import type { RequestFetch } from "../../shared/server/request-fetch";
import type { ServiceHelperRouteDefinition } from "../../shared/server/service-registry";

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface ToolRegistryServiceMetadata {
  id: string;
  title: string;
  description: string;
  helperRoutes?: ToolRegistryHelperRouteDefinition[];
}

export type ToolRegistryHelperRouteDefinition = ServiceHelperRouteDefinition;

export interface ToolRegistryServiceDefinition {
  id: string;
  title: string;
  description: string;
  helperRoutes: ToolRegistryHelperRouteDefinition[];
  tools: ToolDefinition[];
}

export interface ToolCallResult {
  content: Array<{ type: "text" | "json"; text?: string; json?: unknown }>;
  structuredContent?: unknown;
  bytes?: Uint8Array;
  mimeType?: string;
  isError?: boolean;
}

export interface ToolRegistration<TContext = any> {
  service: ToolRegistryServiceMetadata;
  definition: ToolDefinition;
  call: (
    args: Record<string, unknown>,
    context: TContext,
  ) => ToolCallResult | Promise<ToolCallResult>;
}

export interface ToolRegistryService {
  definition: ToolRegistryServiceDefinition;
  callTool: (toolName: string, args: unknown) => ToolCallResult | Promise<ToolCallResult>;
}

export type ToolProvider<TContext = any> = (
  context: TContext,
) => ToolRegistration<TContext> | ToolRegistration<TContext>[];

export interface ToolRegistrar<TContext = any> {
  registerTool: (
    provider: ToolProvider<TContext> | ToolProvider<TContext>[],
  ) => ToolProvider<TContext>[];
}

export interface ToolRegistryRouteContext {
  getServices: () => ToolRegistryService[];
  getService: (serviceId: string) => ToolRegistryService | undefined;
  callTool: (
    serviceId: string,
    toolName: string,
    args: unknown,
  ) => Promise<ToolCallResult>;
}

export interface ToolRegistryServiceRegistry<TContext = any> extends ToolRegistrar<TContext> {
  getServices: (context: TContext) => ToolRegistryService[];
  bindRequestFetch: (requestFetch: RequestFetch) => ToolRegistryRouteContext;
}

export interface ToolRegistryServiceRegistryOptions {
  validation?: JsonSchemaValidationService;
}

export function cloneToolDefinition(
  tool: ToolDefinition,
): ToolDefinition {
  return {
    ...tool,
    inputSchema: structuredClone(tool.inputSchema),
    ...(tool.outputSchema ? { outputSchema: structuredClone(tool.outputSchema) } : {}),
  };
}

export function cloneToolRegistryServiceDefinition(
  service: ToolRegistryServiceDefinition,
): ToolRegistryServiceDefinition {
  return {
    id: service.id,
    title: service.title,
    description: service.description,
    helperRoutes: cloneHelperRoutes(service.helperRoutes),
    tools: service.tools.map(cloneToolDefinition),
  };
}
