import type { CodeViewerController } from "./code-editor-viewer-core";
import {
  createInlineCodeViewerFromContainer,
  findInlineCodeViewerContainers,
} from "./code-editor-inline-viewer";

export interface InlineCodeViewerRegistryOptions {
  readOnly?: boolean;
  scrollPastEnd?: number;
  padding?: number;
  onError?: (error: unknown) => void;
}

export interface InlineCodeViewerRegistry {
  destroy: () => void;
  refresh: (scope?: HTMLElement) => Promise<void>;
  resize: (scope?: Node | null) => void;
}

function isInlineCodeViewerVisible(container: HTMLElement): boolean {
  return !container.closest("details.compact-bubble-panel:not([open])");
}

export function createInlineCodeViewerRegistry(
  getHost: () => HTMLElement | null,
  options: InlineCodeViewerRegistryOptions = {},
): InlineCodeViewerRegistry {
  const inlineCodeViewers = new Map<HTMLElement, CodeViewerController>();

  function destroyInlineCodeViewer(container: HTMLElement): void {
    const controller = inlineCodeViewers.get(container);
    if (!controller) {
      return;
    }

    controller.destroy();
    inlineCodeViewers.delete(container);
  }

  async function ensureInlineCodeViewer(container: HTMLElement): Promise<void> {
    if (inlineCodeViewers.has(container)) {
      return;
    }

    try {
      const controller = await createInlineCodeViewerFromContainer(container, {
        readOnly: options.readOnly ?? true,
        scrollPastEnd: options.scrollPastEnd ?? 0,
        padding: options.padding ?? 10,
      });
      if (!controller) {
        return;
      }

      if (!getHost()?.contains(container)) {
        controller.destroy();
        return;
      }

      inlineCodeViewers.set(container, controller);
    } catch (error) {
      options.onError?.(error);
    }
  }

  return {
    destroy() {
      for (const controller of inlineCodeViewers.values()) {
        controller.destroy();
      }

      inlineCodeViewers.clear();
    },

    resize(scope) {
      for (const [container, controller] of inlineCodeViewers) {
        if (scope && !scope.contains(container)) {
          continue;
        }

        controller.resize();
      }
    },

    async refresh(scope) {
      const host = getHost();
      if (!host) {
        this.destroy();
        return;
      }

      const currentContainers = new Set(findInlineCodeViewerContainers(host));

      for (const container of inlineCodeViewers.keys()) {
        if (!currentContainers.has(container)) {
          destroyInlineCodeViewer(container);
        }
      }

      const root = scope ?? host;
      const containers = findInlineCodeViewerContainers(root);

      for (const container of containers) {
        if (!currentContainers.has(container)) {
          continue;
        }

        if (!isInlineCodeViewerVisible(container)) {
          continue;
        }

        await ensureInlineCodeViewer(container);
      }
    },
  };
}
