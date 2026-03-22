import type { JsonValue } from "../../shared/type-api";
import { isRecord } from "../../shared/server/type-guards";
import type {
  AiRequestPromptMessage,
  AiRequestPromptPart,
  ParsedAiRequestPrompt,
} from "./ai-request-middleware-types";

export function parseAiRequestPrompt(
  requestBody: JsonValue | undefined,
): ParsedAiRequestPrompt | null {
  const body = asRecord(requestBody);
  if (!body) {
    return null;
  }

  if (Array.isArray(body.messages)) {
    const messages = body.messages
      .map((message) => parseChatMessage(message))
      .filter((message): message is AiRequestPromptMessage => Boolean(message));

    return buildParsedPrompt("chat", messages, readToolNames(body.tools));
  }

  const promptMessages = parsePromptField(body.prompt);
  if (promptMessages.length > 0) {
    return buildParsedPrompt("prompt", promptMessages, readToolNames(body.tools));
  }

  return {
    kind: "unknown",
    messages: [],
    toolNames: readToolNames(body.tools),
  };
}

function buildParsedPrompt(
  kind: ParsedAiRequestPrompt["kind"],
  messages: AiRequestPromptMessage[],
  toolNames: string[],
): ParsedAiRequestPrompt {
  const systemText = joinRoleText(messages, "system");
  const userText = joinRoleText(messages, "user");
  const lastUserText = [...messages]
    .reverse()
    .find((message) => message.role === "user" && message.text)?.text;

  return {
    kind,
    messages,
    systemText,
    userText,
    lastUserText,
    toolNames,
  };
}

function parseChatMessage(value: unknown): AiRequestPromptMessage | undefined {
  const message = asRecord(value);
  if (!message) {
    return undefined;
  }

  const role = readString(message.role) ?? "user";
  const parts: AiRequestPromptPart[] = [];
  appendContentParts(parts, message.content);
  appendToolCallParts(parts, message.tool_calls);
  appendToolResultPart(parts, role, message);

  const text = parts
    .filter((part) => part.type === "text" && typeof part.text === "string" && part.text.length > 0)
    .map((part) => part.text as string)
    .join("\n\n")
    .trim();

  return {
    role,
    parts,
    ...(text ? { text } : {}),
  };
}

function appendContentParts(parts: AiRequestPromptPart[], content: unknown): void {
  if (typeof content === "string" && content.length > 0) {
    parts.push({
      type: "text",
      text: content,
    });
    return;
  }

  if (!Array.isArray(content)) {
    return;
  }

  for (const item of content) {
    const part = asRecord(item);
    if (!part) {
      continue;
    }

    const type = readString(part.type);
    if (type === "text" || type === "input_text") {
      const text = readString(part.text) ?? readString(part.content);
      if (text) {
        parts.push({
          type: "text",
          text,
        });
      }
      continue;
    }

    if (type === "image_url" || type === "input_image") {
      const imageUrl = asRecord(part.image_url);
      const url = readString(imageUrl?.url) ?? readString(part.url);
      if (url) {
        parts.push({
          type: "image",
          text: url,
        });
      }
    }
  }
}

function appendToolCallParts(parts: AiRequestPromptPart[], toolCalls: unknown): void {
  if (!Array.isArray(toolCalls)) {
    return;
  }

  for (const toolCall of toolCalls) {
    const record = asRecord(toolCall);
    const functionRecord = asRecord(record?.function);
    if (!record || !functionRecord) {
      continue;
    }

    parts.push({
      type: "tool_call",
      id: readString(record.id),
      name: readString(functionRecord.name),
      data: parseJsonString(readString(functionRecord.arguments)),
    });
  }
}

function appendToolResultPart(
  parts: AiRequestPromptPart[],
  role: string,
  message: Record<string, unknown>,
): void {
  if (role !== "tool") {
    return;
  }

  parts.push({
    type: "tool_result",
    id: readString(message.tool_call_id),
    data: asJsonValue(message.content),
  });
}

function parsePromptField(prompt: unknown): AiRequestPromptMessage[] {
  if (typeof prompt === "string" && prompt.trim().length > 0) {
    return [buildPromptMessage(prompt)];
  }

  if (!Array.isArray(prompt)) {
    return [];
  }

  return prompt
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => buildPromptMessage(entry));
}

function buildPromptMessage(text: string): AiRequestPromptMessage {
  return {
    role: "user",
    text,
    parts: [{
      type: "text",
      text,
    }],
  };
}

function joinRoleText(messages: AiRequestPromptMessage[], role: string): string | undefined {
  const text = messages
    .filter((message) => message.role === role && message.text)
    .map((message) => message.text as string)
    .join("\n\n")
    .trim();

  return text || undefined;
}

function readToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      const functionRecord = asRecord(record?.function);
      return readString(functionRecord?.name);
    })
    .filter((entry): entry is string => Boolean(entry));
}

function parseJsonString(value: string | undefined): JsonValue | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asJsonValue(value: unknown): JsonValue | undefined {
  return value === undefined ? undefined : value as JsonValue;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
