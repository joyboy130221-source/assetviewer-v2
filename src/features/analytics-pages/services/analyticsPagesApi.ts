import { api, jsonInit } from "../../../services/api";
import type {
  AnalyticsResult,
  AnalyticsRuntimeInput,
} from "../../analytics/model/analytics.types";
import { runtimeQuery } from "../../analytics/services/analyticsViewState";
import type {
  AnalyticsPageDefinition,
  PageTarget,
  PreviewItems,
  PublicAnalyticsPage,
} from "../model/analyticsPage.types";

const ADMIN = "/api/admin/analytics-pages";
const PREVIEW = "/api/admin/analytics-pages-execute";
const PUBLIC = "/api/public-analytics-pages";

/** URL key of the selected item on published pages. */
export const ITEM_KEY = "_item";

export type PreviewRequest = {
  page: AnalyticsPageDefinition;
  /** Test values for the page parameters. */
  context: Record<string, string>;
  item?: string;
  runtime?: AnalyticsRuntimeInput;
  fresh?: boolean;
};

// jsonInit sets Content-Type: application/json; without it the server
// cannot parse the body.
const post = <T>(body: object) =>
  api<{ data: T }>(PREVIEW, jsonInit("POST", body)).then((r) => r.data);

function publicUrl(
  id: string,
  params: URLSearchParams,
  extra: Record<string, string>,
) {
  const q = new URLSearchParams(params);
  q.delete(ITEM_KEY);
  for (const [key, value] of Object.entries(extra))
    if (value !== "") q.set(key, value);
  return `${PUBLIC}?id=${encodeURIComponent(id)}&${q.toString()}`;
}

export const analyticsPagesApi = {
  list: async () =>
    (await api<{ data: AnalyticsPageDefinition[] }>(ADMIN)).data,
  get: async (id: string) =>
    (
      await api<{ data: AnalyticsPageDefinition | null }>(
        `${ADMIN}?id=${encodeURIComponent(id)}`,
      )
    ).data,
  create: async (page: AnalyticsPageDefinition) =>
    api<{ id: string }>(ADMIN, jsonInit("POST", page)),
  save: async (page: AnalyticsPageDefinition) =>
    api<{ message: string }>(ADMIN, jsonInit("PUT", page)),
  remove: async (id: string) =>
    api<{ message: string }>(ADMIN, jsonInit("DELETE", { id })),

  // Builder preview (unsaved page, draft charts allowed).
  previewItems: (r: PreviewRequest) =>
    post<PreviewItems>({ action: "items", ...r }),
  previewResolve: (r: PreviewRequest) =>
    post<PageTarget>({ action: "resolve", ...r }),
  previewExecute: (r: PreviewRequest) =>
    post<AnalyticsResult>({ action: "execute", ...r }),

  // Published pages.
  publicGet: async (id: string, params: URLSearchParams, fresh = false) =>
    (
      await api<{ data: PublicAnalyticsPage }>(
        publicUrl(id, params, fresh ? { _fresh: "1" } : {}),
      )
    ).data,
  publicResolve: async (id: string, item: string, params: URLSearchParams) =>
    (
      await api<{ data: PageTarget }>(
        publicUrl(id, params, { resolve: "1", [ITEM_KEY]: item }),
      )
    ).data,
  publicExecute: async (
    id: string,
    item: string,
    params: URLSearchParams,
    runtime: AnalyticsRuntimeInput,
  ) => {
    const q = new URLSearchParams(params);
    for (const [key, value] of runtimeQuery(runtime)) q.set(key, value);
    return (
      await api<{ data: AnalyticsResult }>(
        publicUrl(id, q, { execute: "1", [ITEM_KEY]: item }),
      )
    ).data;
  },
};
