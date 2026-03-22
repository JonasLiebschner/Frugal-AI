import type { DashboardState } from "./app/types/dashboard";
import { resolveDashboardPagePath } from "./llmproxy-dashboard-pages";

export const REQUEST_DETAIL_ID_QUERY_KEY = "requestId";
export const REQUEST_DETAIL_TAB_QUERY_KEY = "requestTab";

export type RequestDetailTab = DashboardState["requestDetail"]["tab"];
export type RequestDetailLinkQuery = Record<string, string | string[] | null | undefined>;

const REQUEST_DETAIL_TABS = new Set<RequestDetailTab>(["request", "response", "tools", "diagnosis", "otel"]);

function readFirstQueryValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return "";
}

export function normalizeRequestDetailTab(value: unknown): RequestDetailTab {
  const candidate = readFirstQueryValue(value);
  return REQUEST_DETAIL_TABS.has(candidate as RequestDetailTab)
    ? candidate as RequestDetailTab
    : "request";
}

export function readRequestDetailLinkState(query: Record<string, unknown> | null | undefined): {
  requestId: string;
  tab: RequestDetailTab;
} {
  return {
    requestId: readFirstQueryValue(query?.[REQUEST_DETAIL_ID_QUERY_KEY]).trim(),
    tab: normalizeRequestDetailTab(query?.[REQUEST_DETAIL_TAB_QUERY_KEY]),
  };
}

export function withRequestDetailLinkQuery(
  query: RequestDetailLinkQuery,
  requestId: string,
  tab: RequestDetailTab = "request",
): RequestDetailLinkQuery {
  const nextQuery = { ...query };
  const normalizedRequestId = requestId.trim();
  if (!normalizedRequestId) {
    delete nextQuery[REQUEST_DETAIL_ID_QUERY_KEY];
    delete nextQuery[REQUEST_DETAIL_TAB_QUERY_KEY];
    return nextQuery;
  }

  nextQuery[REQUEST_DETAIL_ID_QUERY_KEY] = normalizedRequestId;
  if (tab === "request") {
    delete nextQuery[REQUEST_DETAIL_TAB_QUERY_KEY];
  } else {
    nextQuery[REQUEST_DETAIL_TAB_QUERY_KEY] = tab;
  }

  return nextQuery;
}

export function clearRequestDetailLinkQuery(query: RequestDetailLinkQuery): RequestDetailLinkQuery {
  return withRequestDetailLinkQuery(query, "");
}

export function resolveRequestDetailDeepLinkPath(
  requestId: string,
  tab: RequestDetailTab = "request",
): string {
  const query = withRequestDetailLinkQuery({}, requestId, tab);
  const searchParams = new URLSearchParams();
  const requestIdValue = readFirstQueryValue(query[REQUEST_DETAIL_ID_QUERY_KEY]);
  const requestTabValue = readFirstQueryValue(query[REQUEST_DETAIL_TAB_QUERY_KEY]);
  if (requestIdValue) {
    searchParams.set(REQUEST_DETAIL_ID_QUERY_KEY, requestIdValue);
  }

  if (requestTabValue) {
    searchParams.set(REQUEST_DETAIL_TAB_QUERY_KEY, requestTabValue);
  }

  const search = searchParams.toString();
  return search
    ? `${resolveDashboardPagePath("logs")}?${search}`
    : resolveDashboardPagePath("logs");
}
