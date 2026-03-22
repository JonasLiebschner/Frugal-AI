export type DashboardConfigTab = "general" | "connections" | "openai" | "mcp";

export const dashboardConfigTabs: Array<{ key: DashboardConfigTab; label: string }> = [
  { key: "general", label: "General Settings" },
  { key: "connections", label: "Connections" },
  { key: "openai", label: "OpenAI compatible API" },
  { key: "mcp", label: "MCP Server" },
];

export function resolveDashboardConfigTabPath(tab: DashboardConfigTab): string {
  if (tab === "general") {
    return "/dashboard/config";
  }

  return `/dashboard/config/${tab}`;
}
