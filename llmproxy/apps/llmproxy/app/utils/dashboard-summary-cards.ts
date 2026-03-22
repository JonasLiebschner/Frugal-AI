import type { ProxySnapshot, SummaryCard } from "../types/dashboard";
import { formatDate, formatDuration } from "./formatters";

export function buildSummaryCards(snapshot: ProxySnapshot): SummaryCard[] {
  const enabledCount = snapshot.backends.filter((backend) => backend.enabled).length;
  const healthyCount = snapshot.backends.filter((backend) => backend.enabled && backend.healthy).length;
  const recentSuccessCount = snapshot.recentRequests.filter((entry) => entry.outcome === "success").length;
  const recentFailureCount = snapshot.recentRequests.filter((entry) => entry.outcome === "error" && Boolean(entry.backendId)).length;
  const recentRejectedCount = snapshot.recentRequests.filter((entry) => entry.outcome !== "success" && !entry.backendId).length;
  const recentCancelledCount = snapshot.recentRequests.filter((entry) => entry.outcome === "cancelled" && Boolean(entry.backendId)).length;
  const healthyTone =
    healthyCount === 0
      ? "bad"
      : healthyCount < enabledCount
        ? "warn"
        : "good";
  const chatCompletionConnections = snapshot.activeConnections.filter(
    (connection) => connection.kind === "chat.completions",
  );
  const activeConnections = chatCompletionConnections.filter(
    (connection) => connection.phase !== "queued" || Boolean(connection.backendId),
  ).length;
  const waitingConnections = chatCompletionConnections.filter(
    (connection) => connection.phase === "queued" && !connection.backendId,
  ).length;
  const uptimeMs = Math.max(0, Date.now() - new Date(snapshot.startedAt).getTime());

  return [
    {
      key: "uptime",
      label: "Uptime",
      value: formatDuration(uptimeMs),
      note: "",
      title: `How long the current llmproxy process has been running. Started: ${formatDate(snapshot.startedAt)}.`,
    },
    {
      key: "healthy-backends",
      label: "Backends",
      value: `${healthyCount} / ${enabledCount}`,
      note: "",
      title: "Backend availability overview. First value: enabled backends that passed their most recent health check. Second value: total enabled backends configured in llmproxy.",
      tone: healthyTone,
      segments: [
        {
          text: String(healthyCount),
          label: "Healthy",
          tone: healthyTone,
          title: "Enabled backends that passed their most recent health check.",
          drilldown: {
            page: "overview",
            hash: "#backend-runtime",
          },
        },
        {
          text: String(enabledCount),
          label: "Total",
          tone: "neutral",
          title: "Total number of enabled backends currently configured in llmproxy.",
          drilldown: {
            page: "overview",
            hash: "#backend-runtime",
          },
        },
      ],
    },
    {
      key: "live-connections",
      label: "Connections",
      value: `${activeConnections} - ${waitingConnections}`,
      note: "",
      title: "Chat completion request load. First value: requests currently active or already assigned to a backend slot. Second value: requests still queued and waiting for a free backend slot.",
      tone: "info",
      segments: [
        {
          text: String(activeConnections),
          label: "Active",
          tone: "info",
          title: "Requests currently active or already assigned to a backend slot.",
          drilldown: {
            page: "overview",
            hash: "#active-connections",
          },
        },
        {
          text: String(waitingConnections),
          label: "Queued",
          tone: "warn",
          title: "Requests still queued because no backend slot is available yet.",
          drilldown: {
            page: "overview",
            hash: "#queued-connections",
          },
        },
      ],
    },
    {
      key: "requests",
      label: `Requests (last ${snapshot.recentRequestLimit})`,
      value: `${recentSuccessCount} / ${recentFailureCount} / ${recentRejectedCount} / ${recentCancelledCount}`,
      note: "",
      title: `Request outcome overview within the last ${snapshot.recentRequestLimit} retained log entries. Successful: completed requests. Failed: requests that had a backend assigned and then errored. Rejected: requests that never received a backend assignment, including no matching backend, no enabled backend, or queue timeout before assignment. Cancelled: requests that had a backend assigned but were cancelled before completion.`,
      tone: "neutral",
      segments: [
        {
          text: String(recentSuccessCount),
          label: "Successful",
          tone: "good",
          title: `Successfully completed requests within the last ${snapshot.recentRequestLimit} retained log entries.`,
          drilldown: {
            page: "logs",
            query: {
              outcome: "success",
            },
          },
        },
        {
          text: String(recentFailureCount),
          label: "Failed",
          tone: "bad",
          title: `Requests within the last ${snapshot.recentRequestLimit} retained log entries that already had a backend assigned and then failed while being proxied or due to an upstream/server error.`,
          drilldown: {
            page: "logs",
            query: {
              outcome: "error",
            },
          },
        },
        {
          text: String(recentCancelledCount),
          label: "Cancelled",
          tone: "warn",
          title: `Requests within the last ${snapshot.recentRequestLimit} retained log entries that already had a backend assigned but were cancelled before completion.`,
          drilldown: {
            page: "logs",
            query: {
              outcome: "cancelled",
            },
          },
        },
        {
          text: String(recentRejectedCount),
          label: "Rejected",
          tone: "warn",
          title: `Requests within the last ${snapshot.recentRequestLimit} retained log entries that never received a backend assignment. This includes cases like no configured backend match, no enabled backend, or timing out while waiting in the queue before a backend slot was assigned.`,
          drilldown: {
            page: "logs",
            query: {
              outcome: "rejected",
            },
          },
        },
      ],
    },
  ];
}
