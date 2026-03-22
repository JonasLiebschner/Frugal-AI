import type { H3Event } from "h3";
import { setEventContextValue } from "../../../shared/server/event-context";

export function attachClientDisconnectSignal(event: H3Event): void {
  const request = event.node.req;
  const disconnectController = new AbortController();

  const handleDisconnect = () => {
    if (disconnectController.signal.aborted) {
      return;
    }

    disconnectController.abort(new Error("Client disconnected."));
  };

  request.once("aborted", handleDisconnect);
  disconnectController.signal.addEventListener("abort", () => {
    request.off("aborted", handleDisconnect);
  }, { once: true });
  event.node.res.once("close", handleDisconnect);
  disconnectController.signal.addEventListener("abort", () => {
    event.node.res.off("close", handleDisconnect);
  }, { once: true });

  setEventContextValue(event, "clientDisconnectSignal", disconnectController.signal);
}

export function destroyClientResponse(event: H3Event, error?: Error): void {
  if (!event.node.res.destroyed) {
    event.node.res.destroy(error);
  }
}
