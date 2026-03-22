import type { RenderMessageOptions, UiBadge } from "../types/dashboard";
import { badgeSpec, buildModelIdentityBadge, describeFinishReason } from "./dashboard-badges";
import { buildMessageRoleBadgeSpec } from "./message-role-badges";

export function buildMessageMetaBadges(
  message: Record<string, any>,
  role: string,
  options: Pick<RenderMessageOptions, "extraBadges" | "finishReason" | "hideFinishBadge" | "hideModelBadge" | "hideRoleBadge" | "hideToolMetaBadges"> = {},
): UiBadge[] {
  const metaBits: UiBadge[] = [];

  if (!options.hideRoleBadge && role !== "user" && role !== "assistant") {
    metaBits.push(buildMessageRoleBadgeSpec(message, role));
  }

  if (!options.hideModelBadge && role === "assistant" && typeof message?.model === "string" && message.model.length > 0) {
    metaBits.push(buildModelIdentityBadge(message.model));
  }

  if (!options.hideToolMetaBadges && role === "tool" && typeof message?.name === "string" && message.name.length > 0) {
    metaBits.push(badgeSpec(`tool ${message.name}`, "warn", "Tool name associated with this tool response."));
  } else if (role !== "tool" && typeof message?.name === "string" && message.name.length > 0) {
    metaBits.push(badgeSpec(`name ${message.name}`, "warn", "Optional message name field."));
  }

  if (!options.hideToolMetaBadges && role === "tool" && typeof message?.tool_call_id === "string" && message.tool_call_id.length > 0) {
    metaBits.push(badgeSpec(`call ${message.tool_call_id}`, "neutral", "Tool call id that this tool response belongs to."));
  }

  if (!options.hideFinishBadge && typeof options.finishReason === "string" && options.finishReason.length > 0) {
    metaBits.push(badgeSpec(`finish ${options.finishReason}`, "good", describeFinishReason(options.finishReason)));
  }

  if (Array.isArray(options.extraBadges) && options.extraBadges.length > 0) {
    metaBits.push(...options.extraBadges);
  }

  return metaBits;
}
