import type { UiBadge } from "../types/dashboard";
import { badgeSpec } from "./dashboard-badges";

function roleTone(role: string): "good" | "warn" | "bad" {
  if (role === "assistant") {
    return "good";
  }

  if (role === "tool" || role === "user" || role === "system" || role === "developer") {
    return "warn";
  }

  return "bad";
}

function getMessageRoleIcon(role: string): string {
  if (role === "system") {
    return "\u{1F9ED}";
  }

  if (role === "user") {
    return "\u{1F642}";
  }

  if (role === "assistant") {
    return "\u{1F916}";
  }

  if (role === "tool") {
    return "\u{1F9F0}";
  }

  if (role === "developer") {
    return "\u{1F6E0}\u{FE0F}";
  }

  return "\u{2754}";
}

function describeMessageRole(role: string): string {
  if (role === "system") {
    return "System message. Provides high-level instructions and behavior guidance for the model.";
  }

  if (role === "user") {
    return "User message. This is input coming from the user or calling application.";
  }

  if (role === "assistant") {
    return "Assistant message. This is model output or a stored assistant response.";
  }

  if (role === "tool") {
    return "Tool message. This carries the result returned by a tool call back into the model conversation.";
  }

  if (role === "developer") {
    return "Developer message. This carries application-level instructions for the model.";
  }

  return "Unknown OpenAI message role.";
}

export function buildMessageRoleBadgeSpec(message: Record<string, any>, role: string): UiBadge {
  const tooltipParts = [describeMessageRole(role)];

  if (role === "tool" && typeof message.tool_call_id === "string" && message.tool_call_id.length > 0) {
    tooltipParts.push(`tool_call_id: ${message.tool_call_id}`);
  }

  return badgeSpec(`${getMessageRoleIcon(role)} ${role}`, roleTone(role), tooltipParts.join("\n"));
}
