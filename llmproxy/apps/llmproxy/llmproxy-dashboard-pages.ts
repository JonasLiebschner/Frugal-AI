import type { DashboardPage } from "./app/types/dashboard";

export function getDashboardPageTitle(page: DashboardPage): string {
  if (page === "logs") {
    return "Requests";
  }

  if (page === "playground") {
    return "Playground";
  }

  if (page === "config") {
    return "Config";
  }

  return "Dashboard";
}

export function resolveDashboardPagePath(page: DashboardPage): string {
  if (page === "logs") {
    return "/dashboard/logs";
  }

  if (page === "playground") {
    return "/dashboard/playground";
  }

  if (page === "config") {
    return "/dashboard/config";
  }

  return "/dashboard";
}

export function resolveDashboardPage(pathname: string, hasConnections: boolean): DashboardPage {
  if (pathname === "/dashboard/config" || pathname.startsWith("/dashboard/config/") || pathname === "/dashboard/connections") {
    return "config";
  }

  if (pathname === "/dashboard/logs" || pathname === "/dashboard/diagnostics") {
    return "logs";
  }

  if (pathname === "/dashboard/playground") {
    return "playground";
  }

  return hasConnections ? "overview" : "config";
}
