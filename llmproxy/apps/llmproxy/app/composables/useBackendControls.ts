import type { DashboardState } from "../types/dashboard";
import { createAiRequestMiddlewareControls } from "./backend-controls/backend-control-ai-request-middleware";
import { createBackendControlBootstrap } from "./backend-controls/backend-control-bootstrap";
import { createConnectionControls } from "./backend-controls/backend-control-connections";
import { createOtelEditorControls } from "./backend-controls/backend-control-otel";
import { createServerEditorControls } from "./backend-controls/backend-control-server";

export function useBackendControls(
  state: DashboardState,
  onErrorToast: (title: string, message: string) => void,
) {
  const bootstrap = createBackendControlBootstrap(state, onErrorToast);
  const connectionControls = createConnectionControls(
    state,
    onErrorToast,
    bootstrap.loadConfigSchemas,
    bootstrap.loadConnectionConfigs,
    bootstrap.refreshDashboardSnapshot,
  );
  const serverControls = createServerEditorControls(
    state,
    onErrorToast,
    bootstrap.loadConfigSchemas,
    bootstrap.loadConnectionConfigs,
  );
  const otelControls = createOtelEditorControls(
    state,
    onErrorToast,
    bootstrap.loadConfigSchemas,
    bootstrap.loadConnectionConfigs,
  );
  const aiRequestMiddlewareControls = createAiRequestMiddlewareControls(
    state,
    onErrorToast,
    bootstrap.loadConfigSchemas,
    bootstrap.loadConnectionConfigs,
  );

  return {
    ...bootstrap,
    ...connectionControls,
    ...serverControls,
    ...otelControls,
    ...aiRequestMiddlewareControls,
  };
}
