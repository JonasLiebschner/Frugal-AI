import type { H3Event } from "h3";

import {
  registerRouteBundle,
  type RouteBundle,
  type RouteRouter,
} from "../server/route-bundle";
import { bindRequestFetchEventContext, type RequestFetchBindable } from "../server/request-fetch";

export interface TestLayerRuntime {
  attachEventContext?: (event: H3Event) => void;
  registerRoutes?: (router: RouteRouter) => void;
}

export type TestLayerStack<TLayers extends Record<string, TestLayerRuntime>> = TLayers & {
  testLayers: readonly TestLayerRuntime[];
};

export function createRouteBundleTestLayer(
  routeBundle: RouteBundle,
  attachEventContext?: (event: H3Event) => void,
): TestLayerRuntime {
  return {
    attachEventContext,
    registerRoutes: (router) => {
      registerRouteBundle(router, routeBundle);
    },
  };
}

export function createTestLayerStack<TLayers extends Record<string, TestLayerRuntime>>(
  layers: TLayers,
): TestLayerStack<TLayers> {
  return {
    ...layers,
    testLayers: Object.values(layers),
  };
}

export function mergeTestLayerEventContext(
  ...handlers: Array<((event: H3Event) => void) | undefined>
): ((event: H3Event) => void) | undefined {
  const activeHandlers = handlers.filter((handler): handler is (event: H3Event) => void => Boolean(handler));

  if (activeHandlers.length === 0) {
    return undefined;
  }

  return (event) => {
    for (const handler of activeHandlers) {
      handler(event);
    }
  };
}

export function createRouteBundleTestRuntime<TState extends object>(
  state: TState,
  routeBundle: RouteBundle,
  attachEventContext?: (event: H3Event) => void,
): TState & TestLayerRuntime {
  return {
    ...state,
    ...createRouteBundleTestLayer(routeBundle, attachEventContext),
  };
}

export function createRequestFetchBoundRouteBundleTestLayer<TBoundContext>(
  contextKey: string,
  bindable: RequestFetchBindable<TBoundContext>,
  routeBundle: RouteBundle,
): TestLayerRuntime {
  return createRouteBundleTestLayer(routeBundle, (event) => {
    bindRequestFetchEventContext(event, contextKey, bindable);
  });
}

export function createRequestFetchBoundRouteBundleTestRuntime<
  TBoundContext,
  TState extends object,
>(
  contextKey: string,
  bindable: RequestFetchBindable<TBoundContext>,
  routeBundle: RouteBundle,
  state: TState,
  attachEventContext?: (event: H3Event) => void,
): TState & TestLayerRuntime {
  const routeLayer = createRequestFetchBoundRouteBundleTestLayer(
    contextKey,
    bindable,
    routeBundle,
  );

  return {
    ...state,
    ...routeLayer,
    attachEventContext: mergeTestLayerEventContext(
      routeLayer.attachEventContext,
      attachEventContext,
    ),
  };
}
