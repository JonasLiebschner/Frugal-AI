import type { ProxySnapshot } from "../../types/dashboard";

export const DASHBOARD_LOAD_TIMEOUT_MS = 8000;
export const DASHBOARD_MUTATION_TIMEOUT_MS = 12000;

export type BackendControlErrorToast = (title: string, message: string) => void;
export type LoadConfigSchemas = (packageNames: string[]) => Promise<void>;
export type LoadConnectionConfigs = () => Promise<void>;
export type RefreshDashboardSnapshot = (silent?: boolean) => Promise<void>;
export type ApplySnapshot = (snapshot: ProxySnapshot) => void;
export type EnsureDebugModel = () => void;
