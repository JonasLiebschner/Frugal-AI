import { nextTick } from "vue";

export function waitForAnimationFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      setTimeout(resolve, 0);
      return;
    }

    window.requestAnimationFrame(() => resolve());
  });
}

export async function waitForDomPaint(): Promise<void> {
  await nextTick();
  await waitForAnimationFrame();
}
