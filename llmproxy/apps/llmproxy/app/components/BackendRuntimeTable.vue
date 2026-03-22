<script setup lang="ts">
import type {
  ActiveConnectionSnapshot,
  BackendSnapshot,
  RequestLogEntry,
} from "../types/dashboard";
import { formatDuration, formatTokenRate } from "../utils/formatters";
import {
  backendStateClass,
  backendStateTitle,
  connectorLabel,
  currentBackendTokenRate,
  recentBackendAverageLatency,
  recentBackendAverageTokenRate,
  recentBackendCancelledCount,
  recentBackendFailureCount,
  recentBackendLastLatency,
  recentBackendLastTokenRate,
  recentBackendRequestCount,
  recentBackendSuccessCount,
  recentWindowLabel,
} from "../utils/backend-table";

const props = withDefaults(defineProps<{
  backends: BackendSnapshot[];
  activeConnections?: ActiveConnectionSnapshot[];
  recentRequests?: RequestLogEntry[];
  recentRequestLimit?: number;
}>(), {
  activeConnections: () => [],
  recentRequests: () => [],
  recentRequestLimit: 0,
});
</script>

<template>
  <div class="table-wrap">
    <table class="backend-table backend-table-runtime">
      <colgroup>
        <col class="backend-col-name">
        <col class="backend-col-type">
        <col class="backend-col-connections">
        <col class="backend-col-traffic">
        <col class="backend-col-latency">
        <col class="backend-col-throughput">
      </colgroup>
      <thead>
        <tr>
          <th>Backend</th>
          <th class="backend-type-cell">Type</th>
          <th class="backend-runtime-connections-cell">
            <span class="backend-runtime-connections-anchor backend-runtime-connections-heading">Connections</span>
          </th>
          <th>Traffic</th>
          <th>Latency</th>
          <th>Throughput</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="backend in props.backends" :key="backend.id">
          <td class="backend-name-cell">
            <div class="backend-name-content">
              <div class="table-name">
                <span
                  :class="['backend-health-dot', backendStateClass(backend)]"
                  :title="backendStateTitle(backend)"
                  aria-hidden="true"
                ></span>
                <span>{{ backend.name }}</span>
              </div>
              <div class="table-sub backend-identity">
                <span class="backend-url">{{ backend.baseUrl }}</span>
              </div>
            </div>
          </td>
          <td class="backend-type-cell">
            <div class="backend-type-content">
              <div class="log-primary">{{ connectorLabel(backend.connector) }}</div>
            </div>
          </td>
          <td class="backend-runtime-connections-cell">
            <div class="backend-runtime-connections-shell">
              <div class="backend-runtime-connections-anchor backend-runtime-connections-content">
                <div
                  class="backend-runtime-connections-value"
                  title="Current backend slot usage. The first number is the active connections on this backend, and the second is the configured maximum concurrency."
                >
                  {{ backend.activeRequests }} / {{ backend.maxConcurrency }}
                </div>
              </div>
            </div>
          </td>
          <td>
            <div class="inline-metric-row log-primary">
              <span class="inline-metric good" :title="`Successful requests served by this backend ${recentWindowLabel(props.recentRequestLimit)}.`">ok {{ recentBackendSuccessCount(backend, props.recentRequests) }}</span>
              <span class="inline-metric bad" :title="`Failed requests served by this backend ${recentWindowLabel(props.recentRequestLimit)}.`">fail {{ recentBackendFailureCount(backend, props.recentRequests) }}</span>
              <span class="inline-metric warn" :title="`Cancelled requests served by this backend ${recentWindowLabel(props.recentRequestLimit)}.`">cancel {{ recentBackendCancelledCount(backend, props.recentRequests) }}</span>
            </div>
            <div class="table-sub" :title="`Total retained requests for this backend ${recentWindowLabel(props.recentRequestLimit)}.`">total {{ recentBackendRequestCount(backend, props.recentRequests) }}</div>
          </td>
          <td>
            <div class="backend-runtime-metric-stack backend-runtime-stat-list log-primary">
              <div class="backend-runtime-stat-row">
                <span class="backend-runtime-stat-label neutral" :title="`Average end-to-end latency for this backend ${recentWindowLabel(props.recentRequestLimit)}.`">avg</span>
                <span class="backend-runtime-stat-value neutral" :title="`Average end-to-end latency for this backend ${recentWindowLabel(props.recentRequestLimit)}.`">
                  {{ formatDuration(recentBackendAverageLatency(backend, props.recentRequests)) }}
                </span>
              </div>
              <div class="backend-runtime-stat-row">
                <span class="backend-runtime-stat-label neutral" :title="`Most recent retained request latency for this backend ${recentWindowLabel(props.recentRequestLimit)}.`">last</span>
                <span class="backend-runtime-stat-value neutral" :title="`Most recent retained request latency for this backend ${recentWindowLabel(props.recentRequestLimit)}.`">
                  {{ formatDuration(recentBackendLastLatency(backend, props.recentRequests)) }}
                </span>
              </div>
            </div>
          </td>
          <td>
            <div class="backend-runtime-metric-stack backend-runtime-stat-list log-primary">
              <div class="backend-runtime-stat-row">
                <span class="backend-runtime-stat-label neutral" :title="`Current summed completion token rate across active connections on this backend. Only active connections with measured token-rate metrics are included.`">current</span>
                <span class="backend-runtime-stat-value neutral" :title="`Current summed completion token rate across active connections on this backend. Only active connections with measured token-rate metrics are included.`">
                  {{ formatTokenRate(currentBackendTokenRate(backend, props.activeConnections)) || "n/a" }}
                </span>
              </div>
              <div class="backend-runtime-stat-row">
                <span class="backend-runtime-stat-label neutral" :title="`Average completion token rate for this backend ${recentWindowLabel(props.recentRequestLimit)}. Only retained requests with measured token-rate metrics are included.`">avg</span>
                <span class="backend-runtime-stat-value neutral" :title="`Average completion token rate for this backend ${recentWindowLabel(props.recentRequestLimit)}. Only retained requests with measured token-rate metrics are included.`">
                  {{ formatTokenRate(recentBackendAverageTokenRate(backend, props.recentRequests)) || "n/a" }}
                </span>
              </div>
              <div class="backend-runtime-stat-row">
                <span class="backend-runtime-stat-label neutral" :title="`Most recent retained completion token rate for this backend ${recentWindowLabel(props.recentRequestLimit)}.`">last</span>
                <span class="backend-runtime-stat-value neutral" :title="`Most recent retained completion token rate for this backend ${recentWindowLabel(props.recentRequestLimit)}.`">
                  {{ formatTokenRate(recentBackendLastTokenRate(backend, props.recentRequests)) || "n/a" }}
                </span>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
