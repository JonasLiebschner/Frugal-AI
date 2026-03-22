import type { ConfigService, ConfigUtils } from "../../config/server/config-capability";

export interface OtelConfigServiceOptions {
  config?: ConfigService;
  utils?: ConfigUtils;
}
