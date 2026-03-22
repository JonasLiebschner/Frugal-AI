import type { ProxySnapshot } from "../../shared/type-api";

export const FIXED_DASHBOARD_PATH = "/dashboard";

export function normalizeDashboardSubPath(pathname: string): string {
  return pathname !== "/" && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

export function resolveDashboardLandingPage(snapshot: Pick<ProxySnapshot, "backends">): "overview" | "config" {
  return snapshot.backends.length > 0 ? "overview" : "config";
}
