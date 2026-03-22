import { createRouter, type EventHandler } from "h3";

export type RouteRouter = ReturnType<typeof createRouter>;

export interface RouteRegistration {
  path: string;
  handler: EventHandler;
}

export interface RouteBundle {
  get?: RouteRegistration[];
  post?: RouteRegistration[];
  options?: RouteRegistration[];
  put?: RouteRegistration[];
  patch?: RouteRegistration[];
  delete?: RouteRegistration[];
  use?: RouteRegistration[];
}

export function registerRouteBundle(
  router: RouteRouter,
  bundle: RouteBundle,
): void {
  for (const route of bundle.get ?? []) {
    router.get(route.path, route.handler);
  }

  for (const route of bundle.post ?? []) {
    router.post(route.path, route.handler);
  }

  for (const route of bundle.options ?? []) {
    router.options(route.path, route.handler);
  }

  for (const route of bundle.put ?? []) {
    router.put(route.path, route.handler);
  }

  for (const route of bundle.patch ?? []) {
    router.patch(route.path, route.handler);
  }

  for (const route of bundle.delete ?? []) {
    router.delete(route.path, route.handler);
  }

  for (const route of bundle.use ?? []) {
    router.use(route.path, route.handler);
  }
}
