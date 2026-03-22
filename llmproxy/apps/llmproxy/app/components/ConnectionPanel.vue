<script setup lang="ts">
import type { PropType } from "vue";
import { useDashboardStore } from "../composables/useDashboardStore";
import { badgeClass, buildModelIdentityBadge } from "../utils/dashboard-badges";
import { buildConnectionTransportBadges } from "../utils/dashboard-connection-badges";
import type { ActiveConnectionSnapshot } from "../types/dashboard";
import { formatClientIp } from "../utils/client-ip";

const props = defineProps({
  panelId: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  emptyText: {
    type: String,
    required: true,
  },
  connections: {
    type: Array as PropType<ActiveConnectionSnapshot[]>,
    required: true,
  },
  embedded: {
    type: Boolean,
    default: false,
  },
});

const store = useDashboardStore();

function connectionIdentityBadges(connection: ActiveConnectionSnapshot): Array<{ text: string; title: string; className: string }> {
  const badges: Array<{ text: string; title: string; className: string }> = [];
  const clientIp = formatClientIp(connection.clientIp);

  badges.push({
    text: store.shortId(connection.id),
    title: `Request ID: ${connection.id}.`,
    className: "badge identity-request",
  });

  badges.push({
    text: "chat completion",
    title: "Request type: chat completion.",
    className: "badge identity-kind",
  });

  if (clientIp) {
    badges.push({
      text: clientIp,
      title: `Client IP address: ${clientIp}.`,
      className: "badge identity-ip",
    });
  }

  if (connection.model) {
    const modelBadge = buildModelIdentityBadge(connection.model, `Requested or selected model: ${connection.model}.`);
    badges.push({
      text: modelBadge.text,
      title: modelBadge.title ?? "",
      className: modelBadge.className ?? "badge identity-model",
    });
  }

  if (connection.backendName) {
    badges.push({
      text: connection.backendName,
      title: `Currently assigned backend: ${connection.backendName}.`,
      className: "badge identity-backend",
    });
  }

  return badges;
}

</script>

<template>
  <div :id="props.panelId" :class="props.embedded ? 'connection-section' : 'panel'">
    <div :class="props.embedded ? 'connection-section-header' : 'panel-header'">
      <div>
        <component :is="props.embedded ? 'h3' : 'h2'" :class="props.embedded ? 'connection-section-title' : 'panel-title'">
          {{ props.title }}
        </component>
      </div>
    </div>
    <div v-if="props.connections.length" class="request-list">
      <article
        v-for="connection in props.connections"
        :key="connection.id"
        class="request-card"
      >
        <div class="request-main">
          <div class="request-card-body">
            <div class="request-title-row">
              <span
                v-for="identityBadge in connectionIdentityBadges(connection)"
                :key="`${connection.id}-${identityBadge.text}`"
                :class="identityBadge.className"
                :title="identityBadge.title"
              >
                {{ identityBadge.text }}
              </span>
              <span
                v-for="badge in store.connectionCardBadges(connection)"
                :key="badge.text + badge.title"
                :class="store.badgeClass(badge)"
                :title="badge.title"
              >
                {{ badge.text }}
              </span>
            </div>
          </div>
          <div class="request-actions">
            <button
              type="button"
              class="icon-button danger"
              :disabled="store.isRequestCancelling(connection.id)"
              :aria-label="store.isRequestCancelling(connection.id) ? 'Ending the connection' : 'End this connection'"
              :title="store.isRequestCancelling(connection.id) ? 'Ending the connection...' : 'End this connection after confirmation.'"
              @click="store.cancelActiveRequest(connection.id)"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3.5v7"></path>
                <path d="M7.05 6.05a7 7 0 1 0 9.9 0"></path>
              </svg>
            </button>
            <button
              type="button"
              class="icon-button"
              :disabled="!connection.hasDetail"
              :aria-label="connection.hasDetail ? 'Open connection details' : 'Connection details are not available yet'"
              :title="connection.hasDetail ? 'Open the request inspector.' : 'Detail data is not available for this request yet.'"
              @click="store.openRequestDetail(connection.id)"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 6.5V5.25a3 3 0 0 1 6 0V6.5"></path>
                <path d="M8.5 8h7A1.5 1.5 0 0 1 17 9.5v4.9a5 5 0 0 1-10 0V9.5A1.5 1.5 0 0 1 8.5 8Z"></path>
                <path d="M12 3.5v1.75"></path>
                <path d="M7 11.75H4.75"></path>
                <path d="M19.25 11.75H17"></path>
                <path d="M7.2 9.35 5.25 7.8"></path>
                <path d="M16.8 9.35 18.75 7.8"></path>
                <path d="M7.2 15.65 5.25 17.2"></path>
                <path d="M16.8 15.65 18.75 17.2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="request-meta">
          <span
            v-for="(badge, index) in buildConnectionTransportBadges(connection, { invertDirections: true })"
            :key="`${connection.id}-transport-${index}`"
            :class="badgeClass(badge)"
            :title="badge.title"
          >
            {{ badge.text }}
          </span>
        </div>
        <div v-if="store.connectionMetricBadges(connection).length" class="request-metrics">
          <span
            v-for="badge in store.connectionMetricBadges(connection)"
            :key="badge.text + badge.title"
            :class="store.badgeClass(badge)"
            :title="badge.title"
          >
            {{ badge.text }}
          </span>
        </div>
      </article>
    </div>
    <div v-else class="empty">{{ props.emptyText }}</div>
  </div>
</template>
