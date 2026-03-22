import type {
  EditableAiRequestRoutingMiddleware,
  KnownModel,
} from "./app/types/dashboard";

export interface DebugModelOption {
  key: string;
  value: string;
  label: string;
  disabled?: boolean;
}

const AUTO_DEBUG_MODEL_VALUE = "auto";
const DEBUG_MIDDLEWARE_MODEL_PREFIX = "middleware:";
const DEBUG_MODEL_SEPARATOR_LABEL = "----------------";

export function toDebugMiddlewareModelValue(middlewareId: string): string {
  return `${DEBUG_MIDDLEWARE_MODEL_PREFIX}${middlewareId}`;
}

export function isValidDebugModelSelection(
  selection: string | undefined,
  models: KnownModel[],
  middlewares: EditableAiRequestRoutingMiddleware[],
): boolean {
  if (!selection) {
    return false;
  }

  if (selection === AUTO_DEBUG_MODEL_VALUE) {
    return true;
  }

  if (selection.startsWith(DEBUG_MIDDLEWARE_MODEL_PREFIX)) {
    const middlewareId = selection.slice(DEBUG_MIDDLEWARE_MODEL_PREFIX.length).trim();
    return middlewareId.length > 0 && middlewares.some((middleware) => middleware.id === middlewareId);
  }

  return models.some((model) => model.id === selection);
}

export function buildDebugModelOptions(
  models: KnownModel[],
  middlewares: EditableAiRequestRoutingMiddleware[],
): DebugModelOption[] {
  const options: DebugModelOption[] = [{
    key: "auto",
    value: AUTO_DEBUG_MODEL_VALUE,
    label: "auto",
  }];

  const sortedMiddlewares = [...middlewares].sort((left, right) => left.id.localeCompare(right.id));
  const sortedModels = [...models].sort((left, right) => left.id.localeCompare(right.id));

  if (sortedMiddlewares.length > 0) {
    options.push({
      key: "separator-middlewares",
      value: "__separator_middlewares__",
      label: DEBUG_MODEL_SEPARATOR_LABEL,
      disabled: true,
    });

    for (const middleware of sortedMiddlewares) {
      options.push({
        key: `middleware:${middleware.id}`,
        value: toDebugMiddlewareModelValue(middleware.id),
        label: `middleware:${middleware.id}`,
      });
    }
  }

  if (sortedModels.length > 0) {
    options.push({
      key: "separator-models",
      value: "__separator_models__",
      label: DEBUG_MODEL_SEPARATOR_LABEL,
      disabled: true,
    });

    for (const model of sortedModels) {
      options.push({
        key: `model:${model.id}`,
        value: model.id,
        label: model.id,
      });
    }
  }

  return options;
}
