import type { H3Event } from "h3";

type NitroLifecycleHookHost = {
  hooks: {
    hook: (...args: any[]) => any;
    hookOnce: (...args: any[]) => any;
  };
};

export function attachNitroEventContext<Host extends NitroLifecycleHookHost, T>(
  host: Host,
  value: T,
  attach: (event: H3Event, value: T) => void,
): void {
  host.hooks.hook("request", (event: H3Event) => {
    attach(event, value);
  });
}

export function closeNitroLifecycle<Host extends NitroLifecycleHookHost>(
  host: Host,
  close: () => Promise<void>,
): void {
  host.hooks.hookOnce("close", async () => {
    await close();
  });
}
