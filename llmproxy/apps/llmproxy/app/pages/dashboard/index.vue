<script setup lang="ts">
import { computed } from "vue";
import BrandMark from "../../components/BrandMark.vue";
import BackendsPage from "../../components/dashboard-pages/BackendsPage.vue";
import OverviewPage from "../../components/dashboard-pages/OverviewPage.vue";
import { useDashboardStore } from "../../composables/useDashboardStore";
import { isDashboardReady as getIsDashboardReady } from "../../../llmproxy-client";

const store = useDashboardStore();

const isReady = computed(() => getIsDashboardReady(store.state));
const showOverview = computed(() => isReady.value && store.state.snapshot.backends.length > 0);
</script>

<template>
  <OverviewPage v-if="showOverview" />
  <BackendsPage v-else-if="isReady" tab="general" />
  <section v-else class="shell-loading" aria-live="polite" aria-busy="true">
    <div class="boot-panel">
      <div class="boot-brand" aria-hidden="true">
        <BrandMark class="boot-logo" />
      </div>
      <h1>llmproxy</h1>
      <p>Loading dashboard data and live status.</p>
    </div>
  </section>
</template>
