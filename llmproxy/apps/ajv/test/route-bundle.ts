import type { RouteBundle } from "../../shared/server/route-bundle";
import apiAjvValidatePost from "../server/api/ajv/validate.post";

export const ajvTestRouteBundle: RouteBundle = {
  post: [
    { path: "/api/ajv/validate", handler: apiAjvValidatePost },
  ],
};
