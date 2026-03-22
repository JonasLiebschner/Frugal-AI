import { defineEventHandler, sendRedirect } from "h3";
import { FIXED_DASHBOARD_PATH } from "../llmproxy-dashboard";

export default defineEventHandler((event) => {
  return sendRedirect(event, FIXED_DASHBOARD_PATH, 302);
});
