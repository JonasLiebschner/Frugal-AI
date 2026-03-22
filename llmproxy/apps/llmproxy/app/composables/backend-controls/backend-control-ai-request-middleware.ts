import type {
  AiRequestMiddlewareEditorFields,
  DashboardState,
} from "../../types/dashboard";
import { createAiRequestMiddlewareEditorFields } from "../../../llmproxy-client";
import {
  llmproxyAdminAiRequestMiddlewaresPath,
  resolveLlmproxyAdminAiRequestMiddlewarePath,
} from "../../../llmproxy-admin-routes";
import {
  closeAiRequestMiddlewareEditorState,
} from "./backend-control-helpers";
import { fetchJsonWithTimeout, fetchWithTimeout, readErrorResponse } from "../../../llmproxy-client";
import {
  type BackendControlErrorToast,
  DASHBOARD_MUTATION_TIMEOUT_MS,
  type LoadConfigSchemas,
  type LoadConnectionConfigs,
} from "./backend-control-runtime";

export function createAiRequestMiddlewareControls(
  state: DashboardState,
  onErrorToast: BackendControlErrorToast,
  loadConfigSchemas: LoadConfigSchemas,
  loadConnectionConfigs: LoadConnectionConfigs,
) {
  function openCreateAiRequestMiddleware(): void {
    void loadConfigSchemas(["ai-request-middleware"]);
    state.aiRequestMiddlewareEditor.open = true;
    state.aiRequestMiddlewareEditor.mode = "create";
    state.aiRequestMiddlewareEditor.originalId = "";
    state.aiRequestMiddlewareEditor.saving = false;
    state.aiRequestMiddlewareEditor.deleting = false;
    state.aiRequestMiddlewareEditor.loading = false;
    state.aiRequestMiddlewareEditor.error = "";
    state.aiRequestMiddlewareEditor.fields = createAiRequestMiddlewareEditorFields();
  }

  async function openEditAiRequestMiddleware(middlewareId: string): Promise<void> {
    state.aiRequestMiddlewareEditor.error = "";

    if (state.aiRequestMiddlewares.length === 0) {
      await loadConnectionConfigs();
    }

    const middleware = state.aiRequestMiddlewares.find((entry) => entry.id === middlewareId);
    if (!middleware) {
      state.aiRequestMiddlewareEditor.error = `AI request middleware "${middlewareId}" could not be loaded from config.`;
      onErrorToast("AI request middleware", state.aiRequestMiddlewareEditor.error);
      return;
    }

    state.aiRequestMiddlewareEditor.open = true;
    state.aiRequestMiddlewareEditor.mode = "edit";
    state.aiRequestMiddlewareEditor.originalId = middlewareId;
    state.aiRequestMiddlewareEditor.saving = false;
    state.aiRequestMiddlewareEditor.deleting = false;
    state.aiRequestMiddlewareEditor.loading = false;
    state.aiRequestMiddlewareEditor.error = "";
    state.aiRequestMiddlewareEditor.fields = createAiRequestMiddlewareEditorFields(middleware);
  }

  function closeAiRequestMiddlewareEditor(): void {
    closeAiRequestMiddlewareEditorState(state);
  }

  async function saveAiRequestMiddlewareEditor(fieldsOverride?: AiRequestMiddlewareEditorFields): Promise<void> {
    const { mode, originalId } = state.aiRequestMiddlewareEditor;
    const fields = fieldsOverride ?? state.aiRequestMiddlewareEditor.fields;
    state.aiRequestMiddlewareEditor.error = "";

    try {
      const requestBody = {
        id: fields.id.trim(),
        url: fields.url.trim(),
        models: {
          small: fields.smallModel.trim(),
          large: fields.largeModel.trim(),
        },
      };

      state.aiRequestMiddlewareEditor.saving = true;

      await fetchJsonWithTimeout<unknown>(
        mode === "create"
          ? llmproxyAdminAiRequestMiddlewaresPath
          : resolveLlmproxyAdminAiRequestMiddlewarePath(originalId),
        {
          method: mode === "create" ? "POST" : "PUT",
          headers: {
            "content-type": "application/json",
          },
          timeoutMs: DASHBOARD_MUTATION_TIMEOUT_MS,
          body: JSON.stringify(requestBody),
        },
      );

      await loadConnectionConfigs();

      closeAiRequestMiddlewareEditorState(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.aiRequestMiddlewareEditor.error = message;
      onErrorToast("AI request middleware", message);
    } finally {
      state.aiRequestMiddlewareEditor.saving = false;
    }
  }

  async function deleteAiRequestMiddlewareEditor(): Promise<void> {
    const { mode, originalId, fields } = state.aiRequestMiddlewareEditor;
    state.aiRequestMiddlewareEditor.error = "";

    if (mode !== "edit" || !originalId) {
      return;
    }

    await deleteAiRequestMiddlewareById(originalId, fields.id || originalId, true);
  }

  async function deleteAiRequestMiddlewareById(
    middlewareId: string,
    displayName?: string,
    fromEditor = false,
  ): Promise<void> {
    state.aiRequestMiddlewareEditor.error = "";
    const middlewareLabel = displayName || middlewareId;
    const confirmed = window.confirm(
      `Remove AI request middleware "${middlewareLabel}" from the persisted config?\n\nNew requests will no longer wait for this external router.`,
    );

    if (!confirmed) {
      return;
    }

    if (fromEditor) {
      state.aiRequestMiddlewareEditor.deleting = true;
    }

    try {
      const response = await fetchWithTimeout(
        resolveLlmproxyAdminAiRequestMiddlewarePath(middlewareId),
        {
          method: "DELETE",
          timeoutMs: DASHBOARD_MUTATION_TIMEOUT_MS,
        },
      );

      if (!response.ok) {
        throw new Error(await readErrorResponse(response));
      }

      state.aiRequestMiddlewares = state.aiRequestMiddlewares.filter((middleware) => middleware.id !== middlewareId);

      if (state.aiRequestMiddlewareEditor.open && state.aiRequestMiddlewareEditor.originalId === middlewareId) {
        closeAiRequestMiddlewareEditorState(state);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.aiRequestMiddlewareEditor.error = message;
      onErrorToast("AI request middleware", message);
    } finally {
      if (fromEditor) {
        state.aiRequestMiddlewareEditor.deleting = false;
      }
    }
  }

  return {
    openCreateAiRequestMiddleware,
    openEditAiRequestMiddleware,
    closeAiRequestMiddlewareEditor,
    saveAiRequestMiddlewareEditor,
    deleteAiRequestMiddlewareEditor,
    deleteAiRequestMiddlewareById,
  };
}
