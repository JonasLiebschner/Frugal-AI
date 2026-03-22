export interface ServiceHelperRouteDefinition {
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
}

export function cloneHelperRoutes<TRoute extends ServiceHelperRouteDefinition>(
  routes?: readonly TRoute[],
): TRoute[] {
  return routes?.map((route) => ({ ...route })) ?? [];
}

export function dedupeHelperRoutes<TRoute extends ServiceHelperRouteDefinition>(
  routes: readonly TRoute[],
): TRoute[] {
  const seen = new Set<string>();
  const deduped: TRoute[] = [];

  for (const route of routes) {
    const key = `${route.method}:${route.path}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push({ ...route });
  }

  return deduped;
}

export function registerRegistryProviders<TProvider>(
  providerSet: Set<TProvider>,
  provider: TProvider | TProvider[],
): TProvider[] {
  const nextProviders = Array.isArray(provider) ? provider : [provider];
  for (const entry of nextProviders) {
    providerSet.add(entry);
  }

  return nextProviders;
}

export function resolveRegistryProviders<TContext, TResolved>(
  providers: ReadonlySet<(context: TContext) => TResolved | TResolved[]>,
  context: TContext,
): TResolved[] {
  return Array.from(providers).flatMap((provider) => {
    const result = provider(context);
    return Array.isArray(result) ? result : [result];
  });
}

export interface ServiceRouteLookup<TService> {
  getServices: () => TService[];
  getService: (serviceId: string) => TService | undefined;
}

export function createServiceRouteLookup<TService>(
  getServices: () => TService[],
  getServiceId: (service: TService) => string,
): ServiceRouteLookup<TService> {
  return {
    getServices,
    getService: (serviceId) => getServices()
      .find((service) => getServiceId(service) === serviceId),
  };
}
