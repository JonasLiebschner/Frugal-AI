import { reactive } from "vue";
import type { DashboardState, ProxySnapshot } from "../types/dashboard";
import { fetchWithTimeout, readErrorResponse } from "../../llmproxy-client";
import type { DashboardToastHandler } from "./useDashboardToasts";

const REQUEST_CANCEL_TIMEOUT_MS = 8000;

export function useActiveRequestCancellation(
  state: DashboardState,
  showToast: DashboardToastHandler,
) {
  const pendingCancels = reactive<Record<string, boolean>>({});

  function syncActiveRequestState(snapshot: ProxySnapshot): void {
    const activeRequestIds = new Set(snapshot.activeConnections.map((connection) => connection.id));
    for (const requestId of Object.keys(pendingCancels)) {
      if (!activeRequestIds.has(requestId)) {
        delete pendingCancels[requestId];
      }
    }
  }

  function isRequestCancelling(requestId: string): boolean {
    return Boolean(pendingCancels[requestId]);
  }

  function canCancelRequest(requestId: string): boolean {
    return state.snapshot.activeConnections.some((connection) => connection.id === requestId);
  }

  async function cancelActiveRequest(requestId: string): Promise<void> {
    const connection = state.snapshot.activeConnections.find((entry) => entry.id === requestId);
    if (!connection || pendingCancels[requestId]) {
      return;
    }

    const connectionLabel = `${connection.method} ${connection.path}`;
    const confirmed = window.confirm(
      `End the active connection "${connectionLabel}" now?\n\nThe client will receive a cancelled request, and any partial response already received will stay in request history.`,
    );
    if (!confirmed) {
      return;
    }

    pendingCancels[requestId] = true;

    try {
      const response = await fetchWithTimeout(`/api/llmproxy/admin/requests/${encodeURIComponent(requestId)}/cancel`, {
        method: "POST",
        timeoutMs: REQUEST_CANCEL_TIMEOUT_MS,
      });
      if (!response.ok) {
        throw new Error(await readErrorResponse(response));
      }
    } catch (error) {
      delete pendingCancels[requestId];
      const message = error instanceof Error ? error.message : String(error);
      if (state.requestDetail.requestId === requestId) {
        state.requestDetail.error = message;
      }
      showToast("Active connection", `Could not end the active connection: ${message}`);
    }
  }

  return {
    syncActiveRequestState,
    isRequestCancelling,
    canCancelRequest,
    cancelActiveRequest,
  };
}
