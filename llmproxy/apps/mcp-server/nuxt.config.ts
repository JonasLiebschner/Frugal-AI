export default defineNuxtConfig({
  compatibilityDate: "2024-09-06",
  runtimeConfig: {
    private: {
      mcpEnabled: true,
      mcpAllowedOrigins: [] as string[],
      mcpSessionTtlMs: 1000 * 60 * 60,
    },
  },
});
