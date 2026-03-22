import { onBeforeUnmount, watch, type WatchSource } from "vue";

const activeDialogStack: symbol[] = [];

function pushActiveDialog(dialogId: symbol): void {
  const existingIndex = activeDialogStack.indexOf(dialogId);
  if (existingIndex >= 0) {
    activeDialogStack.splice(existingIndex, 1);
  }

  activeDialogStack.push(dialogId);
}

function removeActiveDialog(dialogId: symbol): void {
  const existingIndex = activeDialogStack.indexOf(dialogId);
  if (existingIndex >= 0) {
    activeDialogStack.splice(existingIndex, 1);
  }
}

function isTopmostDialog(dialogId: symbol): boolean {
  return activeDialogStack[activeDialogStack.length - 1] === dialogId;
}

export function useDialogEscape(isOpen: WatchSource<boolean>, onClose: () => void): void {
  const dialogId = Symbol("dialog-escape");
  let listenerAttached = false;

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || event.defaultPrevented) {
      return;
    }

    if (!isTopmostDialog(dialogId)) {
      return;
    }

    event.preventDefault();
    onClose();
  }

  function attachListener(): void {
    if (listenerAttached || typeof window === "undefined") {
      return;
    }

    window.addEventListener("keydown", handleKeyDown);
    listenerAttached = true;
  }

  function detachListener(): void {
    if (!listenerAttached || typeof window === "undefined") {
      return;
    }

    window.removeEventListener("keydown", handleKeyDown);
    listenerAttached = false;
  }

  watch(
    isOpen,
    (open) => {
      if (open) {
        pushActiveDialog(dialogId);
        attachListener();
        return;
      }

      removeActiveDialog(dialogId);
      detachListener();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    removeActiveDialog(dialogId);
    detachListener();
  });
}
