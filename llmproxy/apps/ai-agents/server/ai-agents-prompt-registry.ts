import type { RequestFetch } from "../../shared/server/request-fetch";
import {
  cloneHelperRoutes,
  createServiceRouteLookup,
  dedupeHelperRoutes,
  registerRegistryProviders,
  resolveRegistryProviders,
} from "../../shared/server/service-registry";
import {
  clonePromptDefinition,
} from "./ai-agents-types";
import type {
  AiAgentHelperRouteDefinition,
  AiAgentPromptCompletionRequest,
  AiAgentPromptCompletionResult,
  AiAgentPromptDefinition,
  AiAgentPromptPayload,
  AiAgentPromptProvider,
  AiAgentPromptRegistration,
  AiAgentPromptRegistry,
  AiAgentPromptRouteContext,
  AiAgentPromptService,
  AiAgentPromptServiceDefinition,
  AiAgentServiceMetadata,
} from "./ai-agents-types";

export function cloneAiAgentPromptDefinition(prompt: AiAgentPromptDefinition): AiAgentPromptDefinition {
  return clonePromptDefinition(prompt);
}

export function cloneAiAgentPromptServiceDefinition(
  service: AiAgentPromptServiceDefinition,
): AiAgentPromptServiceDefinition {
  return {
    id: service.id,
    title: service.title,
    description: service.description,
    helperRoutes: cloneHelperRoutes(service.helperRoutes),
    prompts: service.prompts.map(cloneAiAgentPromptDefinition),
  };
}

export function createAiAgentPromptRegistry<TContext = any>(): AiAgentPromptRegistry<TContext> {
  const promptProviders = new Set<AiAgentPromptProvider<TContext>>();
  const getServicesForContext = (context: TContext) => buildPromptServices(
    resolveRegistryProviders(promptProviders, context),
    context,
  );

  return {
    registerPrompt: (provider) => registerRegistryProviders(promptProviders, provider),
    getServices: getServicesForContext,
    bindRequestFetch: (requestFetch) => ({
      ...createServiceRouteLookup(
        () => getServicesForContext(requestFetch as TContext) as AiAgentPromptService<RequestFetch>[],
        (service) => service.definition.id,
      ),
      getPrompt: async (serviceId, promptName, args) => {
        const service = getServicesForContext(requestFetch as TContext)
          .find((entry) => entry.definition.id === serviceId);

        if (!service) {
          throw new Error(`Prompt service "${serviceId}" was not found.`);
        }

        return await service.getPrompt(promptName, args);
      },
      completePrompt: async (serviceId, promptName, request) => {
        const service = getServicesForContext(requestFetch as TContext)
          .find((entry) => entry.definition.id === serviceId);

        if (!service) {
          throw new Error(`Prompt service "${serviceId}" was not found.`);
        }

        return await service.completePrompt(promptName, request);
      },
    }),
  };
}

interface PromptServiceBucket<TContext> {
  metadata: AiAgentServiceMetadata;
  helperRoutes: AiAgentHelperRouteDefinition[];
  prompts: AiAgentPromptRegistration<TContext>[];
}

function buildPromptServices<TContext>(
  promptRegistrations: AiAgentPromptRegistration<TContext>[],
  context: TContext,
): AiAgentPromptService<TContext>[] {
  if (promptRegistrations.length === 0) {
    return [];
  }

  const buckets = new Map<string, PromptServiceBucket<TContext>>();
  for (const registration of promptRegistrations) {
    const bucket = getPromptServiceBucket(buckets, registration.service);
    bucket.prompts.push(registration);
  }

  return Array.from(buckets.values()).map((bucket) => ({
    definition: {
      id: bucket.metadata.id,
      title: bucket.metadata.title,
      description: bucket.metadata.description,
      helperRoutes: dedupeHelperRoutes(bucket.helperRoutes),
      prompts: bucket.prompts.map((registration) => cloneAiAgentPromptDefinition(registration.definition)),
    },
    getPrompt: async (promptName, args) => {
      const registration = bucket.prompts.find((entry) => entry.definition.name === promptName);
      if (!registration) {
        throw new Error(`Unknown agent prompt "${promptName}".`);
      }

      return await registration.get(args, context);
    },
    completePrompt: async (promptName, request) => {
      const registration = bucket.prompts.find((entry) => entry.definition.name === promptName);
      if (!registration) {
        throw new Error(`Unknown agent prompt "${promptName}".`);
      }

      if (!registration.complete) {
        return {
          values: [],
          total: 0,
          hasMore: false,
        };
      }

      return await registration.complete(request, context);
    },
  }));
}

function getPromptServiceBucket<TContext>(
  buckets: Map<string, PromptServiceBucket<TContext>>,
  metadata: AiAgentServiceMetadata,
): PromptServiceBucket<TContext> {
  const existing = buckets.get(metadata.id);
  if (existing) {
    if (Array.isArray(metadata.helperRoutes)) {
      existing.helperRoutes.push(...cloneHelperRoutes(metadata.helperRoutes));
    }
    return existing;
  }

  const created: PromptServiceBucket<TContext> = {
    metadata: {
      id: metadata.id,
      title: metadata.title,
      description: metadata.description,
      helperRoutes: cloneHelperRoutes(metadata.helperRoutes),
    },
    helperRoutes: cloneHelperRoutes(metadata.helperRoutes),
    prompts: [],
  };
  buckets.set(metadata.id, created);
  return created;
}
