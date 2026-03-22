import { defineEventHandler, getRouterParam } from "h3";
import { requireLlmproxyAdminAiProxy } from "../../../../../llmproxy-admin";

export default defineEventHandler(async (event) => (await requireLlmproxyAdminAiProxy(event)).requestState.openRequestDetailSse(
  event,
  getRouterParam(event, "id") ?? "",
));
