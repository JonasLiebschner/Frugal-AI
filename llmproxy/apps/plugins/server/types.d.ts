import type { PluginsCapability } from "./plugins-capability";

declare module "nitropack" {
  interface NitroApp {
    $plugins: PluginsCapability;
  }
}
