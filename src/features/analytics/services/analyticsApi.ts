import { api, jsonInit } from "../../../services/api";
import type {
  AnalyticsDefinition,
  AnalyticsResult,
  Organization,
} from "../model/analytics.types";
export const analyticsApi = {
  organizations: async () =>
    (await api<{ data: Organization[] }>("/api/admin/organizations")).data,
  list: async () =>
    (await api<{ data: AnalyticsDefinition[] }>("/api/admin/analytics")).data,
  get: async (id: string) =>
    (
      await api<{ data: AnalyticsDefinition | null }>(
        `/api/admin/analytics?id=${encodeURIComponent(id)}`,
      )
    ).data,
  create: async (body: Partial<AnalyticsDefinition>) =>
    (await api<{ id: string }>("/api/admin/analytics", jsonInit("POST", body)))
      .id,
  save: (body: AnalyticsDefinition) =>
    api("/api/admin/analytics", jsonInit("PUT", body)),
  remove: (id: string) =>
    api("/api/admin/analytics", jsonInit("DELETE", { id })),
  execute: async (
    definition: Partial<AnalyticsDefinition>,
    context: Record<string, unknown> = {},
  ) =>
    (
      await api<{ data: AnalyticsResult }>(
        "/api/admin/analytics-execute",
        jsonInit("POST", { definition, context }),
      )
    ).data,
  publicGet: async (id: string) =>
    (
      await api<{ data: AnalyticsDefinition }>(
        `/api/public-analytics?id=${encodeURIComponent(id)}`,
      )
    ).data,
  publicExecute: async (id: string, queryString = "") =>
    (
      await api<{ data: AnalyticsResult }>(
        `/api/public-analytics?id=${encodeURIComponent(id)}&execute=1${queryString ? `&${queryString}` : ""}`,
      )
    ).data,
};
