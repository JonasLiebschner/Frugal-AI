import type { AjvCapability } from "./ajv-capability";

declare module "nitropack" {
  interface NitroApp {
    $ajv: AjvCapability;
  }
}
