import { api, jsonInit } from "../../../services/api";
import type {
  AnalyticsBuilderLimits,
  AnalyticsDefinition,
  AnalyticsResult,
  AnalyticsRuntimeInput,
  Organization,
} from "../model/analytics.types";
import { runtimeQuery } from "./analyticsViewState";
export const analyticsApi = {
  organizations: async () =>
    (await api<{ data: Organization[] }>("/api/admin/organizations")).data,
  /** Bounds for builder settings such as the source timeout. */
  limits: async () =>
    (
      await api<{ data: AnalyticsBuilderLimits }>(
        "/api/admin/analytics?limits=1",
      )
    ).data,
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
    runtime: AnalyticsRuntimeInput = {},
  ) =>
    (
      await api<{ data: AnalyticsResult }>(
        "/api/admin/analytics-execute",
        jsonInit("POST", { definition, context, runtime }),
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
  /** Published execution: caller parameters (asset code, …) plus viewer controls. */
  publicRun: async (
    id: string,
    callerParams: URLSearchParams,
    runtime: AnalyticsRuntimeInput,
  ) => {
    const q = new URLSearchParams(callerParams);
    for (const [key, value] of runtimeQuery(runtime)) q.set(key, value);
    const qs = q.toString();
    return (
      await api<{ data: AnalyticsResult }>(
        `/api/public-analytics?id=${encodeURIComponent(id)}&execute=1${qs ? `&${qs}` : ""}`,
      )
    ).data;
  },
};
