import type { ActiveConnectionRuntime, LiveRequestState } from "../ai-proxy-types";

interface CreateProxyRouteAbortHandleOptions {
  requestState: Pick<LiveRequestState, "updateConnection">;
  requestId: string;
}

interface RegisterProxyClientDisconnectHandlerOptions {
  clientDisconnectSignal: AbortSignal;
  isResponseFinished: () => boolean;
  abortRequest: (
    message: string,
    cancelSource?: ActiveConnectionRuntime["cancelSource"],
  ) => void;
}

export interface ProxyRouteAbortHandle {
  abortController: AbortController;
  abortRequest: (
    message: string,
    cancelSource?: ActiveConnectionRuntime["cancelSource"],
  ) => void;
  cancelActiveRequest: (message?: string) => void;
}

export function createProxyRouteAbortHandle(
  options: CreateProxyRouteAbortHandleOptions,
): ProxyRouteAbortHandle {
  const { requestState, requestId } = options;
  const abortController = new AbortController();

  const abortRequest = (
    message: string,
    cancelSource?: ActiveConnectionRuntime["cancelSource"],
  ) => {
    if (!abortController.signal.aborted) {
      requestState.updateConnection(requestId, {
        cancelSource,
        error: message,
      }, true);
      abortController.abort(new Error(message));
    }
  };

  return {
    abortController,
    abortRequest,
    cancelActiveRequest(message = "Request cancelled from dashboard.") {
      abortRequest(message, "dashboard");
    },
  };
}

export function registerProxyClientDisconnectHandler(
  options: RegisterProxyClientDisconnectHandlerOptions,
): () => void {
  const { clientDisconnectSignal, isResponseFinished, abortRequest } = options;
  const handleClientDisconnect = () => {
    if (isResponseFinished()) {
      return;
    }

    abortRequest("Client disconnected.", "client_disconnect");
  };

  if (clientDisconnectSignal.aborted) {
    handleClientDisconnect();
  } else {
    clientDisconnectSignal.addEventListener("abort", handleClientDisconnect, { once: true });
  }

  return () => {
    clientDisconnectSignal.removeEventListener("abort", handleClientDisconnect);
  };
}
