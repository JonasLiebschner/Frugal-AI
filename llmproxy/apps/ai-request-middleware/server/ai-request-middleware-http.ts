import { isRecord } from "../../shared/server/type-guards";
import type {
  AiRequestRoutingHttpRequest,
  AiRequestRoutingMiddleware,
  AiRequestRoutingMiddlewareContext,
  AiRequestRoutingModelClass,
  ConfiguredAiRequestRoutingMiddleware,
} from "./ai-request-middleware-types";

interface HttpAiRequestRoutingMiddlewareOptions {
  fetcher?: typeof fetch;
}

export function createHttpAiRequestRoutingMiddleware(
  middleware: ConfiguredAiRequestRoutingMiddleware,
  options: HttpAiRequestRoutingMiddlewareOptions = {},
): AiRequestRoutingMiddleware {
  const fetcher = options.fetcher ?? fetch;

  return {
    id: middleware.id,
    route: async (context) => {
      const requestBody = buildHttpRoutingRequest(context);
      if (!requestBody) {
        return undefined;
      }

      const response = await fetcher(middleware.url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: context.signal,
      });

      if (!response.ok) {
        throw new Error(
          `AI request middleware "${middleware.id}" failed with HTTP ${response.status}${await readHttpErrorSuffix(response)}.`,
        );
      }

      if (response.status === 204) {
        return undefined;
      }

      return normalizeHttpRoutingResponse(await response.json(), middleware);
    },
  };
}

function buildHttpRoutingRequest(
  context: AiRequestRoutingMiddlewareContext,
): AiRequestRoutingHttpRequest | undefined {
  const query = resolveMiddlewareQuery(context);
  if (!query) {
    return undefined;
  }

  return { query };
}

function normalizeHttpRoutingResponse(
  input: unknown,
  middleware: ConfiguredAiRequestRoutingMiddleware,
) {
  if (input === undefined || input === null) {
    return {};
  }

  if (!isRecord(input)) {
    throw new Error(`AI request middleware "${middleware.id}" returned an invalid JSON object.`);
  }

  const directModel = normalizeDirectModel(input.model, middleware.id);
  const result = directModel
    ? normalizeOptionalClassificationResult(input.result)
    : normalizeClassificationResult(input.result, middleware.id);

  if (directModel) {
    return {
      model: directModel,
      metadata: {
        model: directModel,
        ...(result ? { classification: result } : {}),
      },
    };
  }

  if (!result) {
    return {};
  }

  return {
    model: middleware.models[result],
    metadata: {
      classification: result,
    },
  };
}

function normalizeDirectModel(
  value: unknown,
  middlewareId: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  throw new Error(`AI request middleware "${middlewareId}" returned an invalid routed model.`);
}

function normalizeOptionalClassificationResult(
  value: unknown,
): AiRequestRoutingModelClass | undefined {
  return value === "small" || value === "large"
    ? value
    : undefined;
}

function normalizeClassificationResult(
  value: unknown,
  middlewareId: string,
): AiRequestRoutingModelClass | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value === "small" || value === "large") {
    return value;
  }

  throw new Error(`AI request middleware "${middlewareId}" returned an invalid classification result.`);
}

async function readHttpErrorSuffix(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (isRecord(payload)) {
      const message = readErrorMessage(payload.error) ?? readErrorMessage(payload);
      if (message) {
        return `: ${message}`;
      }
    }
  } catch {
    // Ignore invalid or empty error payloads and fall back to status-only messages.
  }

  return "";
}

function readErrorMessage(
  value: unknown,
): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return typeof value.message === "string" && value.message.trim().length > 0
    ? value.message.trim()
    : undefined;
}

function resolveMiddlewareQuery(
  context: AiRequestRoutingMiddlewareContext,
): string | undefined {
  const prompt = context.prompt;
  if (!prompt) {
    return undefined;
  }

  const preferredValues = [
    prompt.lastUserText,
    prompt.userText,
    prompt.systemText,
  ];

  for (const value of preferredValues) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const messageTexts = prompt.messages
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter((value) => value.length > 0);

  if (messageTexts.length > 0) {
    return messageTexts.join("\n\n");
  }

  return undefined;
}
