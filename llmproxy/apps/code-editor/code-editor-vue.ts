import { onBeforeUnmount } from "vue";
import type { Ref } from "vue";
import { waitForAnimationFrame, waitForDomPaint } from "./code-editor-browser-paint";
import {
  createInlineCodeViewerRegistry,
  type InlineCodeViewerRegistryOptions,
} from "./code-editor-inline-viewer-registry";

export interface ResizableCodeViewer {
  resize: () => void;
}

export interface UseCodeViewerResizeResult {
  scheduleResize: () => Promise<void>;
}

export function useCodeViewerResize(
  viewer: Ref<ResizableCodeViewer | null>,
): UseCodeViewerResizeResult {
  return {
    async scheduleResize(): Promise<void> {
      await waitForDomPaint();
      viewer.value?.resize();
    },
  };
}

export interface UseInlineCodeViewersResult {
  queueRefresh: (scope?: HTMLElement | null) => void;
  refresh: (scope?: HTMLElement) => Promise<void>;
  resize: (scope?: Node | null) => void;
}

export function useInlineCodeViewers(
  host: Ref<HTMLElement | null>,
  options: InlineCodeViewerRegistryOptions = {},
): UseInlineCodeViewersResult {
  const registry = createInlineCodeViewerRegistry(() => host.value, options);

  async function refresh(scope?: HTMLElement): Promise<void> {
    await waitForDomPaint();
    await registry.refresh(scope);
  }

  function resize(scope?: Node | null): void {
    registry.resize(scope ?? null);
  }

  function queueRefresh(scope?: HTMLElement | null): void {
    const run = () => {
      void refresh(scope ?? undefined).then(() => {
        void waitForAnimationFrame().then(() => {
          resize(scope ?? null);
        });
      });
    };

    void waitForAnimationFrame().then(run);
  }

  onBeforeUnmount(() => {
    registry.destroy();
  });

  return {
    queueRefresh,
    refresh,
    resize,
  };
}
