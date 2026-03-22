import { defineEventHandler, setResponseStatus } from "h3";
import { applyAiServerPublicCors } from "../../../ai-server-public-cors";

export default defineEventHandler((event) => {
  applyAiServerPublicCors(event);
  setResponseStatus(event, 204);
  return "";
});
