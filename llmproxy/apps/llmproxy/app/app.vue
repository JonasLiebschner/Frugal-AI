<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import AiRequestMiddlewareEditorDialog from "./components/AiRequestMiddlewareEditorDialog.vue";
import BrandLogo from "./components/BrandLogo.vue";
import DebugChatDialog from "./components/DebugChatDialog.vue";
import OtelConfigEditorDialog from "./components/OtelConfigEditorDialog.vue";
import RequestDetailDialog from "./components/RequestDetailDialog.vue";
import ServerConfigEditorDialog from "./components/ServerConfigEditorDialog.vue";
import { useDashboardStore } from "./composables/useDashboardStore";
import type { DashboardPage } from "./types/dashboard";
import { getDashboardPageTitle, resolveDashboardPage, resolveDashboardPagePath } from "../llmproxy-client";

const store = useDashboardStore();
const route = useRoute();

const pageLinks: Array<{ page: DashboardPage; label: string; to: string; icon: string[] }> = [
  {
    page: "overview",
    label: "Dashboard",
    to: resolveDashboardPagePath("overview"),
    icon: [
      "M4 5.5h6v6H4z",
      "M14 5.5h6v9h-6z",
      "M4 15.5h6v4H4z",
      "M14 17.5h6v2h-6z",
    ],
  },
  {
    page: "logs",
    label: "Requests",
    to: resolveDashboardPagePath("logs"),
    icon: [
      "M6 5.5h12",
      "M6 10.5h12",
      "M6 15.5h12",
      "M4 5.5h.01",
      "M4 10.5h.01",
      "M4 15.5h.01",
    ],
  },
  {
    page: "playground",
    label: "Playground",
    to: resolveDashboardPagePath("playground"),
    icon: [
      "M5.5 7.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H11l-3.5 3v-3H7.5a2 2 0 0 1-2-2z",
    ],
  },
];

const currentPage = computed<DashboardPage>(() => {
  return resolveDashboardPage(route.path, store.state.snapshot.backends.length > 0);
});
const currentAiRequestMiddlewareConfig = computed(() => {
  const middlewareId = store.state.aiRequestMiddlewareEditor.originalId;
  return middlewareId
    ? store.state.aiRequestMiddlewares.find((middleware) => middleware.id === middlewareId) ?? null
    : null;
});

onMounted(() => {
  store.start();
});

onBeforeUnmount(() => {
  store.stop();
});

watch(
  currentPage,
  (page) => {
    document.title = `llmproxy - ${getDashboardPageTitle(page)}`;
  },
  { immediate: true },
);
</script>

<template>
  <div class="shell" :class="{ 'shell-playground': currentPage === 'playground' }">
    <div class="hero-sticky">
      <header class="hero">
        <div class="hero-bar">
          <div class="hero-nav-group">
            <div class="page-nav">
              <div class="brand-status-shell">
                <NuxtLink class="brand-link page-nav-brand" to="/dashboard/config" aria-label="Open configuration dashboard" title="Open configuration dashboard">
                  <BrandLogo compact title="Open configuration dashboard" />
                </NuxtLink>
                <span
                  :class="['brand-connection-indicator', store.state.connectionStatus]"
                  :title="store.state.connectionText"
                  aria-hidden="true"
                >
                  <span class="connection-dot"></span>
                </span>
              </div>
              <nav class="page-nav-links" aria-label="Dashboard pages">
                <NuxtLink
                  v-for="link in pageLinks"
                  :key="link.page"
                  :to="link.to"
                  class="page-link"
                  :class="[{ active: currentPage === link.page }, `page-link-${link.page}`]"
                >
                  <svg class="page-link-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                    <path v-for="pathDef in link.icon" :key="pathDef" :d="pathDef"></path>
                  </svg>
                  <span>{{ link.label }}</span>
                </NuxtLink>
              </nav>
            </div>
          </div>
        </div>
      </header>
    </div>

    <main class="shell-content">
      <NuxtPage />
    </main>
    <div v-if="store.state.toasts.length" class="toast-stack" aria-live="polite" aria-atomic="true">
      <div
        v-for="toast in store.state.toasts"
        :key="toast.id"
        class="toast-card"
        :class="toast.tone"
      >
        <div class="toast-body">
          <div v-if="toast.title" class="toast-title">{{ toast.title }}</div>
          <div class="toast-message">{{ toast.message }}</div>
        </div>
        <button
          class="toast-dismiss"
          type="button"
          aria-label="Dismiss notification"
          title="Dismiss notification"
          @click="store.dismissToast(toast.id)"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
            <path d="M6 6 18 18"></path>
            <path d="M18 6 6 18"></path>
          </svg>
        </button>
      </div>
    </div>
    <DebugChatDialog />
    <RequestDetailDialog />
    <ServerConfigEditorDialog
      :state="store.state.serverEditor"
      :current-config="store.state.serverConfig"
      :config-schema="store.state.configSchemas['ai-client']"
      @close="store.closeServerEditor"
      @save="store.saveServerEditor"
    />
    <OtelConfigEditorDialog
      :state="store.state.otelEditor"
      :current-config="store.state.otelConfig"
      :config-schema="store.state.configSchemas['otel']"
      @close="store.closeOtelEditor"
      @save="store.saveOtelEditor"
    />
    <AiRequestMiddlewareEditorDialog
      :state="store.state.aiRequestMiddlewareEditor"
      :current-config="currentAiRequestMiddlewareConfig"
      :config-schema="store.state.configSchemas['ai-request-middleware']"
      @close="store.closeAiRequestMiddlewareEditor"
      @save="store.saveAiRequestMiddlewareEditor"
      @delete="store.deleteAiRequestMiddlewareEditor"
    />
  </div>
</template>
