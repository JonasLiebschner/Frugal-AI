import { fileURLToPath } from "node:url";
import { llmproxyNitroRouteRules } from "./server/llmproxy-dashboard";

const dashboardCssPath = fileURLToPath(new URL("./app/assets/css/dashboard.css", import.meta.url));
const externalServerPackages = [
  "@opentelemetry/api",
  "@opentelemetry/core",
  "@opentelemetry/resources",
  "@opentelemetry/sdk-trace-base",
  "@opentelemetry/otlp-transformer",
];

export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  css: [dashboardCssPath],
  routeRules: llmproxyNitroRouteRules,
  postcss: {
    plugins: {
      "@tailwindcss/postcss": {},
    },
  },
  compatibilityDate: "2024-09-06",
  typescript: {
    typeCheck: false,
  },
  nitro: {
    experimental: {
      openAPI: false,
    },
    externals: {
      external: externalServerPackages,
    },
  },
});
