export { createPluginsService } from "./plugins-runtime";

import type { PluginsService } from "./plugins-types";

export type {
  PluginItem,
  PluginRegistry,
  PluginsService,
} from "./plugins-types";

export type PluginsCapability = PluginsService;
