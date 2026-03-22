import type { PluginsService } from "../plugins-client";

declare module "#app" {
  interface NuxtApp {
    $plugins: PluginsService;
  }
}
