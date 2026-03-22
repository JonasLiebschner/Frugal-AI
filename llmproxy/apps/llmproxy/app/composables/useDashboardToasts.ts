import type { DashboardState, ToastItem } from "../types/dashboard";

export type DashboardToastTone = ToastItem["tone"];
export type DashboardToastHandler = (
  title: string,
  message: string,
  tone?: DashboardToastTone,
  timeoutMs?: number,
) => void;

export function useDashboardToasts(state: DashboardState) {
  const toastTimers = new Map<number, number>();
  let nextToastId = 1;
  let lastToastKey = "";
  let lastToastAt = 0;

  function dismissToast(toastId: number): void {
    const index = state.toasts.findIndex((toast) => toast.id === toastId);
    if (index >= 0) {
      state.toasts.splice(index, 1);
    }

    const timer = toastTimers.get(toastId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      toastTimers.delete(toastId);
    }
  }

  function showToast(
    title: string,
    message: string,
    tone: DashboardToastTone = "bad",
    timeoutMs = 5500,
  ): void {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    const now = Date.now();
    const toastKey = `${tone}|${title.trim()}|${trimmedMessage}`;
    if (toastKey === lastToastKey && now - lastToastAt < 4000) {
      return;
    }

    lastToastKey = toastKey;
    lastToastAt = now;

    const toastId = nextToastId;
    nextToastId += 1;
    state.toasts.push({
      id: toastId,
      title: title.trim(),
      message: trimmedMessage,
      tone,
    });

    const timer = window.setTimeout(() => {
      dismissToast(toastId);
    }, timeoutMs);
    toastTimers.set(toastId, timer);
  }

  function stopToastTimers(): void {
    for (const timer of toastTimers.values()) {
      window.clearTimeout(timer);
    }

    toastTimers.clear();
  }

  return {
    showToast,
    dismissToast,
    stopToastTimers,
  };
}
