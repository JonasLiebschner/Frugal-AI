import type { RequestFetch } from "../../shared/server/request-fetch";
import type { ServiceHelperRouteDefinition } from "../../shared/server/service-registry";

export interface PromptArgumentDefinition {
  name: string;
  description: string;
  required: boolean;
}

export interface PromptDefinition {
  name: string;
  title: string;
  description: string;
  arguments: PromptArgumentDefinition[];
}

export interface PromptMessage {
  role: "system" | "user";
  text: string;
}

export interface PromptPayload {
  name: string;
  description: string;
  messages: PromptMessage[];
}

export interface PromptCompletionRequest {
  argumentName: string;
  value: string;
  contextArguments: Record<string, string>;
}

export interface PromptCompletionResult {
  values: string[];
  total?: number;
  hasMore?: boolean;
}

export type PromptHelperRouteDefinition = ServiceHelperRouteDefinition;

export interface PromptServiceMetadata {
  id: string;
  title: string;
  description: string;
  helperRoutes?: PromptHelperRouteDefinition[];
}

export interface PromptRegistration<TContext = unknown> {
  service: PromptServiceMetadata;
  definition: PromptDefinition;
  get: (
    args: Record<string, unknown>,
    context: TContext,
  ) => PromptPayload | Promise<PromptPayload>;
  complete?: (
    request: PromptCompletionRequest,
    context: TContext,
  ) => PromptCompletionResult | Promise<PromptCompletionResult>;
}

export type PromptProvider<TContext = unknown> = (
  context: TContext,
) => PromptRegistration<TContext> | PromptRegistration<TContext>[];

export interface PromptRegistrar<TContext = unknown> {
  registerPrompt: (
    provider: PromptProvider<TContext> | PromptProvider<TContext>[],
  ) => PromptProvider<TContext>[];
}

export function clonePromptDefinition(prompt: PromptDefinition): PromptDefinition {
  return {
    ...prompt,
    arguments: prompt.arguments.map((argument) => ({ ...argument })),
  };
}

export type AiAgentPromptDefinition = PromptDefinition;
export type AiAgentPromptPayload = PromptPayload;
export type AiAgentHelperRouteDefinition = PromptHelperRouteDefinition;
export type AiAgentServiceMetadata = PromptServiceMetadata;
export type AiAgentPromptRegistration<TContext = any> = PromptRegistration<TContext>;
export type AiAgentPromptProvider<TContext = any> = PromptProvider<TContext>;
export type AiAgentPromptCompletionRequest = PromptCompletionRequest;
export type AiAgentPromptCompletionResult = PromptCompletionResult;

export interface AiAgentPromptServiceDefinition {
  id: string;
  title: string;
  description: string;
  helperRoutes: AiAgentHelperRouteDefinition[];
  prompts: AiAgentPromptDefinition[];
}

export interface AiAgentPromptService<TContext = any> {
  definition: AiAgentPromptServiceDefinition;
  getPrompt: (
    promptName: string,
    args: Record<string, unknown>,
  ) => AiAgentPromptPayload | Promise<AiAgentPromptPayload>;
  completePrompt: (
    promptName: string,
    request: AiAgentPromptCompletionRequest,
  ) => AiAgentPromptCompletionResult | Promise<AiAgentPromptCompletionResult>;
}

export interface AiAgentPromptRegistry<TContext = any> {
  registerPrompt: PromptRegistrar<TContext>["registerPrompt"];
  getServices: (context: TContext) => AiAgentPromptService<TContext>[];
  bindRequestFetch: (requestFetch: RequestFetch) => AiAgentPromptRouteContext;
}

export interface AiAgentPromptRouteContext {
  getServices: () => AiAgentPromptService<RequestFetch>[];
  getService: (serviceId: string) => AiAgentPromptService<RequestFetch> | undefined;
  getPrompt: (
    serviceId: string,
    promptName: string,
    args: Record<string, unknown>,
  ) => Promise<AiAgentPromptPayload>;
  completePrompt: (
    serviceId: string,
    promptName: string,
    request: AiAgentPromptCompletionRequest,
  ) => Promise<AiAgentPromptCompletionResult>;
}
