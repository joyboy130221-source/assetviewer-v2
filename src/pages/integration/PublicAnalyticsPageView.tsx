import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AnalyticsPageViewer } from "../../features/analytics-pages/components/AnalyticsPageViewer";
import {
  ITEM_KEY,
  analyticsPagesApi,
} from "../../features/analytics-pages/services/analyticsPagesApi";
import type { PublicAnalyticsPage } from "../../features/analytics-pages/model/analyticsPage.types";
import type { AnalyticsRuntimeInput } from "../../features/analytics/model/analytics.types";
import {
  themeOverride,
  useResolvedTheme,
} from "../../features/analytics/services/analyticsTheme";
import { callerParameters } from "../../features/analytics/services/analyticsViewState";

/** Host-link parameters as they are now (chart controls stripped). */
const currentParams = () =>
  callerParameters(new URLSearchParams(window.location.search));

/** Published Analytics Page: /analytics-page/:pageId?<parameters>&_item=… */
export default function PublicAnalyticsPageView() {
  const { pageId = "" } = useParams();
  const [page, setPage] = useState<PublicAnalyticsPage | null>(null);
  const [error, setError] = useState("");
  // Read once: chart viewers rewrite their own keys in the URL afterwards.
  const initialSearch = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  // ?darkTheme=true|false (BECS) or ?theme=dark|light overrides the page theme.
  const theme = useResolvedTheme(page?.theme, themeOverride(initialSearch));

  const loadPage = useCallback(
    (fresh = false) =>
      analyticsPagesApi
        .publicGet(pageId, currentParams(), fresh)
        .then((p) => {
          setPage(p);
          setError("");
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e))),
    [pageId],
  );
  useEffect(() => {
    if (pageId) void loadPage();
  }, [pageId, loadPage]);

  const remember = page?.selector.enabled && page.selector.rememberInLink;
  const initialItem = remember ? (initialSearch.get(ITEM_KEY) ?? "") : "";

  /** New item: drop the previous chart's controls; keep the item if configured. */
  const onItemChange = useCallback(
    (item: string) => {
      const next = currentParams();
      next.delete(ITEM_KEY);
      if (remember && item) next.set(ITEM_KEY, item);
      const qs = next.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}`,
      );
    },
    [remember],
  );

  const resolve = useCallback(
    (item: string) =>
      analyticsPagesApi.publicResolve(pageId, item, currentParams()),
    [pageId],
  );
  const execute = useCallback(
    (item: string, input: AnalyticsRuntimeInput) =>
      analyticsPagesApi.publicExecute(pageId, item, currentParams(), input),
    [pageId],
  );

  if (!page)
    return (
      <main className={`an-public an-theme-${theme}`}>
        <section className={error ? "state-card error" : "state-card"}>
          {error ? (
            <>
              <h2>Unable to load page</h2>
              <p>{error}</p>
            </>
          ) : (
            <>
              <span className="spinner" /> Loading page…
            </>
          )}
        </section>
      </main>
    );
  return (
    <main className={`an-public an-theme-${theme}`}>
      <section className="an-public-card">
        <header>
          <small>ANALYTICS</small>
          <h1>{page.title || page.name}</h1>
          {page.description && <p>{page.description}</p>}
        </header>
        <AnalyticsPageViewer
          selector={page.selector}
          resolve={resolve}
          execute={execute}
          theme={theme}
          initialItem={initialItem}
          onItemChange={onItemChange}
          onRetryItems={() => void loadPage(true)}
          syncUrl
        />
      </section>
    </main>
  );
}
