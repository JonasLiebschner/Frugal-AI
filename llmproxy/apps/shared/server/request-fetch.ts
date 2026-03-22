import type { H3Event } from "h3";
import { setEventContextValue } from "./event-context";

export type RequestFetch = <T = unknown>(
  request: string,
  options?: any,
) => Promise<T>;

export interface RequestFetchBindable<TBoundContext> {
  bindRequestFetch: (requestFetch: RequestFetch) => TBoundContext;
}

type RequestFetchNitroHost = {
  hooks: {
    hook: (hookName: "request", handler: (event: H3Event) => void) => unknown;
  };
};

export function resolveRequestFetch(requestFetch?: RequestFetch): RequestFetch {
  if (requestFetch) {
    return requestFetch;
  }

  throw new Error("Request-bound fetch is unavailable outside a bound request context.");
}

export function bindRequestFetchEventContext<TBoundContext>(
  event: H3Event,
  contextKey: string,
  bindable: RequestFetchBindable<TBoundContext>,
): void {
  setEventContextValue(
    event,
    contextKey,
    bindable.bindRequestFetch(event.$fetch as RequestFetch),
  );
}

export function attachRequestFetchNitroContext<
  TBoundContext,
  TBindable extends RequestFetchBindable<TBoundContext>,
>(
  host: RequestFetchNitroHost,
  contextKey: string,
  bindable: TBindable,
): void {
  host.hooks.hook("request", (event) => {
    bindRequestFetchEventContext(event, contextKey, bindable);
  });
}
