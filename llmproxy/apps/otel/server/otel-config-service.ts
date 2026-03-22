import { createAppConfigStore } from "../../config/server/config-capability";
import { normalizeOtelConfig, serializeOtelConfig } from "./otel-config";
import type { OtelConfig } from "./otel-types";
import type { OtelConfigService } from "./otel-types";
import type { OtelConfigServiceOptions } from "./otel-config-types";

export function createOtelConfigService(
  options: OtelConfigServiceOptions = {},
): OtelConfigService {
  const document = createAppConfigStore<Partial<OtelConfig>, OtelConfig>({
    packageName: "otel",
    config: options.config,
    utils: options.utils,
    normalize: (parsed, configPath) => normalizeOtelConfig(parsed ?? {}, configPath),
    serialize: serializeOtelConfig,
  });

  return {
    configPath: document.configPath,
    load: async () => await document.load(),
    save: (config) => {
      document.save(config);
    },
  };
}
