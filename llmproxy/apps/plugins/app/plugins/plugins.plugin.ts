import { createPluginsService } from "../../plugins-client";

export default defineNuxtPlugin(() => {
  const plugins = createPluginsService("plugins");

  return {
    provide: {
      plugins,
    },
  };
});
